#!/usr/bin/env python3
"""Read-only Linux process/host monitor; write one JSON object per line.

Usage: python3 monitor.py PID SECONDS OUTPUT
Samples use absolute one-second deadlines. ss/ethtool run only before the
sampling window and after it; their durations are recorded separately.
"""
import argparse
import datetime
import json
import math
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

PROC = Path("/proc")
SYS_NET = Path("/sys/class/net")
STOP_SIGNAL = None


class ProcessGone(Exception):
    def __init__(self, reason, **details):
        super().__init__(reason)
        self.reason = reason
        self.details = details


def timestamp():
    return {"time": time.time(), "monotonic_ns": time.monotonic_ns(),
            "utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}


def error_record(exc):
    return {"type": type(exc).__name__, "errno": getattr(exc, "errno", None), "message": str(exc)}


def parse_stat(raw):
    """comm can contain spaces and ')'; field numbers follow proc_pid_stat(5)."""
    left, right = raw.find("("), raw.rfind(")")
    if left < 1 or right <= left:
        raise ValueError("Malformed proc stat comm")
    fields = raw[right + 1:].split()
    if len(fields) < 22:
        raise ValueError("Truncated proc stat fields")
    return {"pid": int(raw[:left].strip()), "comm": raw[left + 1:right],
            "state": fields[0], "ppid": int(fields[1]),
            "minor_faults": int(fields[7]), "major_faults": int(fields[9]),
            "utime_ticks": int(fields[11]), "stime_ticks": int(fields[12]),
            "num_threads": int(fields[17]), "start_ticks": int(fields[19]),
            "vsize_bytes": int(fields[20]), "rss_pages": int(fields[21]),
            "processor": int(fields[36]) if len(fields) > 36 else None}


def process_stat(pid, expected_start=None):
    try:
        raw = (PROC / str(pid) / "stat").read_text()
    except (FileNotFoundError, ProcessLookupError) as exc:
        raise ProcessGone("process_not_found", error=error_record(exc)) from exc
    fields = parse_stat(raw)
    if fields["pid"] != pid or (expected_start is not None and fields["start_ticks"] != expected_start):
        raise ProcessGone("pid_reused", expected_start_ticks=expected_start,
                          observed_start_ticks=fields["start_ticks"], observed_pid=fields["pid"])
    if fields["state"] in ("Z", "X", "x"):
        raise ProcessGone("process_exited", state=fields["state"], start_ticks=fields["start_ticks"])
    return raw, fields


def read_optional(path, errors, name):
    try:
        return path.read_text()
    except OSError as exc:
        errors[name] = error_record(exc)
        return None


def sample(pid, expected_start, seq, start_ns, scheduled_ns):
    begin_ns = time.monotonic_ns()
    raw, fields = process_stat(pid, expected_start)
    row = {"event": "sample", **timestamp(), "seq": seq, "pid": pid,
           "elapsed_seconds": (begin_ns - start_ns) / 1e9,
           "scheduled_elapsed_seconds": (scheduled_ns - start_ns) / 1e9,
           "schedule_lag_seconds": max(0, begin_ns - scheduled_ns) / 1e9,
           "processstat": raw, "process_stat_fields": fields,
           "tasks": [], "read_errors": {}}
    errors = row["read_errors"]
    for name, relative in (("procstat", "stat"), ("netdev", "net/dev"),
                           ("snmp", "net/snmp"), ("netstat", "net/netstat"),
                           ("softirqs", "softirqs"), ("meminfo", "meminfo")):
        row[name] = read_optional(PROC / relative, errors, name)
    process = PROC / str(pid)
    for name in ("status", "io"):
        row[name] = read_optional(process / name, errors, "process_" + name)
    try:
        tids = sorted((path for path in (process / "task").iterdir() if path.name.isdecimal()),
                      key=lambda path: int(path.name))
    except (FileNotFoundError, ProcessLookupError) as exc:
        raise ProcessGone("process_disappeared_during_sample", error=error_record(exc)) from exc
    for task in tids:
        entry = {"tid": int(task.name)}
        try:
            entry["stat"] = (task / "stat").read_text()
            entry["stat_fields"] = parse_stat(entry["stat"])
            entry["comm"] = (task / "comm").read_text().rstrip("\n")
        except (FileNotFoundError, ProcessLookupError) as exc:
            entry.update(event="ThreadGone", error=error_record(exc))
        except (OSError, ValueError) as exc:
            entry.update(event="ThreadReadError", error=error_record(exc))
        row["tasks"].append(entry)
    # Do not silently attribute a partial sample to a recycled PID.
    process_stat(pid, expected_start)
    row["sample_duration_seconds"] = (time.monotonic_ns() - begin_ns) / 1e9
    return row


def command_snapshot(command, timeout=5):
    executable = shutil.which(command[0])
    row = {"argv": command, **timestamp()}
    if executable is None:
        return dict(row, available=False, error="command_not_found")
    begin = time.monotonic()
    try:
        result = subprocess.run([executable, *command[1:]], capture_output=True,
                                text=True, errors="replace", timeout=timeout, check=False)
        row.update(available=True, returncode=result.returncode, stdout=result.stdout, stderr=result.stderr)
    except subprocess.TimeoutExpired as exc:
        def decoded(value):
            return value.decode(errors="replace") if isinstance(value, bytes) else value
        row.update(available=True, error="command_timeout", timeout_seconds=timeout,
                   stdout=decoded(exc.stdout), stderr=decoded(exc.stderr))
    except OSError as exc:
        row.update(available=True, error=error_record(exc))
    row["duration_seconds"] = time.monotonic() - begin
    return row


def active_interfaces():
    """Inspect existing interfaces only; exclude loopback and down links."""
    interfaces, errors = [], {}
    try:
        paths = sorted(SYS_NET.iterdir())
    except OSError as exc:
        return interfaces, {"sys_class_net": error_record(exc)}
    for path in paths:
        if path.name == "lo":
            continue
        try:
            flags = int((path / "flags").read_text().strip(), 0)
            state = (path / "operstate").read_text().strip()
            # IFF_UP plus operstate unknown admits common virtual interfaces.
            if flags & 1 and state in ("up", "unknown"):
                interfaces.append({"name": path.name, "flags": flags, "operstate": state})
        except OSError as exc:
            errors[path.name] = error_record(exc)
        except ValueError as exc:
            errors[path.name] = error_record(exc)
    return interfaces, errors


def socket_snapshot(phase):
    begin = time.monotonic()
    row = {"event": "socket_snapshot", "phase": phase, **timestamp()}
    row["ss"] = command_snapshot(["ss", "-tin", "( sport = :6379 or dport = :6379 )"])
    interfaces, errors = active_interfaces()
    row["interfaces"] = interfaces
    row["interface_errors"] = errors
    row["ethtool"] = {nic["name"]: command_snapshot(["ethtool", "-S", nic["name"]]) for nic in interfaces}
    row["duration_seconds"] = time.monotonic() - begin
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pid", type=int)
    parser.add_argument("seconds", type=float)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    if sys.platform != "linux":
        parser.error("monitor.py requires Linux /proc and /sys")
    if args.pid <= 0 or not math.isfinite(args.seconds) or args.seconds <= 0:
        parser.error("PID and SECONDS must be positive; SECONDS must be finite")
    global STOP_SIGNAL
    STOP_SIGNAL = None
    def stop(signum, _frame):
        global STOP_SIGNAL
        STOP_SIGNAL = signum
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Refuse to replace prior profiling evidence accidentally.
    with args.output.open("x", encoding="utf-8") as output:
        def emit(row):
            output.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")
            output.flush()
        emit({"event": "metadata", **timestamp(), "pid": args.pid,
              "requested_seconds": args.seconds, "interval_seconds": 1,
              "hostname": socket.gethostname(), "kernel": os.uname().release,
              "uid": os.geteuid(), "clock_ticks_per_second": os.sysconf("SC_CLK_TCK"),
              "page_size_bytes": os.sysconf("SC_PAGE_SIZE"),
              "monitor_pid": os.getpid(), "monitor_cpu_affinity": sorted(os.sched_getaffinity(0)),
              "schema_version": 1,
              "nic_note": "Interface counters are separate; do not sum synthetic NIC and accelerated VF counters blindly."})
        expected_start = None
        samples, skipped = 0, 0
        start_ns = None
        reason, exit_code = "duration_elapsed", 0
        try:
            _, identity = process_stat(args.pid)
            expected_start = identity["start_ticks"]
            emit({"event": "process_identity", **timestamp(), "pid": args.pid, "stat_fields": identity})
            emit(socket_snapshot("start"))
            start_ns = time.monotonic_ns()
            duration_ns = int(args.seconds * 1e9)
            deadline_ns = start_ns + duration_ns
            tick = 0
            while STOP_SIGNAL is None:
                scheduled_ns = min(start_ns + tick * 1_000_000_000, deadline_ns)
                delay = (scheduled_ns - time.monotonic_ns()) / 1e9
                if delay > 0:
                    time.sleep(delay)
                if STOP_SIGNAL is not None:
                    reason = "signal"
                    break
                emit(sample(args.pid, expected_start, samples, start_ns, scheduled_ns))
                samples += 1
                if scheduled_ns == deadline_ns:
                    break
                tick += 1
                # An expensive proc read must not cause a burst of catch-up reads.
                next_tick = (time.monotonic_ns() - start_ns) // 1_000_000_000
                if next_tick > tick:
                    skipped += next_tick - tick
                    emit({"event": "sampling_gap", **timestamp(), "skipped_intervals": next_tick - tick})
                    tick = next_tick
            if STOP_SIGNAL is not None:
                reason = "signal"
        except ProcessGone as exc:
            reason = "ProcessGone"
            emit({"event": "ProcessGone", **timestamp(), "pid": args.pid,
                  "expected_start_ticks": expected_start, "reason": exc.reason, **exc.details})
        except Exception as exc:
            reason, exit_code = "MonitorError", 1
            emit({"event": "MonitorError", **timestamp(), "pid": args.pid, "error": error_record(exc)})
        finally:
            sample_end_ns = time.monotonic_ns()
            emit(socket_snapshot("end"))
            emit({"event": "summary", **timestamp(), "pid": args.pid,
                  "reason": reason, "signal": STOP_SIGNAL, "samples": samples,
                  "skipped_intervals": skipped, "start_ticks": expected_start,
                  "sample_window_elapsed_seconds": None if start_ns is None else (sample_end_ns - start_ns) / 1e9,
                  "completed": reason == "duration_elapsed", "exit_code": exit_code})
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
