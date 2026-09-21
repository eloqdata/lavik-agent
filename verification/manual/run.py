"""Offline Docker runner for the manual; stdout is a machine-readable receipt."""
import base64
import hashlib
import json
import os
import platform
import signal
import socket
import subprocess
import time
from pathlib import Path

from cases import build

PASSWORD = "manual-test-only"  # Throwaway fixture, never a service credential.


class Resp:
    def __init__(self, authenticate=True):
        self.socket = socket.create_connection(("127.0.0.1", 6379), timeout=5)
        self.file = self.socket.makefile("rb")
        if authenticate:
            assert self.command(["AUTH", PASSWORD]) == b"OK"

    def close(self):
        self.file.close()
        self.socket.close()

    def command(self, args):
        data = [v if isinstance(v, bytes) else str(v).encode() for v in args]
        self.socket.sendall(b"*%d\r\n" % len(data) + b"".join(b"$%d\r\n" % len(v) + v + b"\r\n" for v in data))
        return self.read()

    def read(self):
        kind = self.file.read(1)
        if not kind: raise EOFError("Server closed connection")
        line = self.file.readline()
        if not line.endswith(b"\r\n"): raise ValueError("Truncated RESP line")
        value = line[:-2]
        if kind == b"+": return value
        if kind == b"-": return {"error": value.decode()}
        if kind == b":": return int(value)
        if kind == b"_": return None
        if kind == b"#": return value == b"t"
        if kind == b",": return float(value)
        if kind in (b"$", b"=", b"!"):
            n = int(value)
            if n == -1: return None
            data = self.file.read(n)
            if len(data) != n or self.file.read(2) != b"\r\n": raise ValueError("Truncated bulk reply")
            return {"error": data.decode()} if kind == b"!" else data
        if kind in (b"*", b"~", b">"):
            n = int(value)
            return None if n == -1 else [self.read() for _ in range(n)]
        if kind == b"%":
            return {self.read(): self.read() for _ in range(int(value))}
        raise ValueError("Unsupported RESP prefix " + repr(kind))


def normalize(value):
    if isinstance(value, bytes):
        try:
            text = value.decode("utf8")
            if any(ord(c) < 32 and c not in "\r\n\t" for c in text): raise ValueError()
            return text
        except (UnicodeDecodeError, ValueError):
            return {"base64": base64.b64encode(value).decode(), "bytes": len(value)}
    if isinstance(value, list): return [normalize(v) for v in value]
    if isinstance(value, dict): return {normalize(k): normalize(v) for k, v in value.items()}
    return value


def matches(raw, rule):
    value = normalize(raw)
    if "equals" in rule: return value == rule["equals"]
    if "errorContains" in rule: return isinstance(value, dict) and rule["errorContains"].lower() in value.get("error", "").lower()
    if isinstance(value, dict) and "error" in value: return False
    if "contains" in rule: return isinstance(value, (str, list)) and rule["contains"] in value
    if "nestedContains" in rule:
        def search(v): return v == rule["nestedContains"] or (isinstance(v, list) and any(search(x) for x in v))
        return search(value)
    if "integerMin" in rule: return type(value) is int and value >= rule["integerMin"]
    if "integerRange" in rule: return type(value) is int and rule["integerRange"][0] <= value <= rule["integerRange"][1]
    if "first" in rule: return isinstance(value, list) and bool(value) and value[0] == rule["first"]
    if "type" in rule: return rule["type"] == "array" and isinstance(value, list)
    if "binaryMin" in rule: return isinstance(raw, bytes) and len(raw) >= rule["binaryMin"]
    if "mapIncludes" in rule: return isinstance(value, dict) and all(value.get(k) == v for k, v in rule["mapIncludes"].items())
    if "pairsInclude" in rule:
        return isinstance(value, list) and len(value) % 2 == 0 and all(dict(zip(value[::2], value[1::2])).get(k) == v for k, v in rule["pairsInclude"].items())
    if "coordinatesNear" in rule:
        return isinstance(value, list) and len(value) == 1 and all(abs(float(a)-b) < 0.00001 for a, b in zip(value[0], rule["coordinatesNear"]))
    if "scanIncludes" in rule:
        return isinstance(value, list) and len(value) == 2 and value[0] == "0" and rule["scanIncludes"] in value[1]
    if "scanPairs" in rule:
        return isinstance(value, list) and len(value) == 2 and value[0] == "0" and isinstance(value[1], list) and len(value[1]) == 2 * len(rule["scanPairs"]) and dict(zip(value[1][::2], value[1][1::2])) == rule["scanPairs"]
    raise ValueError("Unknown assertion: " + repr(rule))


def start(log):
    root = Path("/tmp/manual-db")
    root.mkdir(exist_ok=True)
    if not (root / "data").exists(): subprocess.run(["fallocate", "-l", "512M", str(root / "data")], check=True)
    args = ["lavik", "--bind", "127.0.0.1", "--port", "6379", "--requirepass", PASSWORD,
            "--metrics-port", "0", "--threads", "2", "--no-pin-workers", "--registered-buffer-mb-per-worker", "64",
            "--shutdown-checkpoint", "--data-file", str(root / "data"), "--log-dir", str(root / "logs"), "--rdb-dir", str(root)]
    proc = subprocess.Popen(args, stdout=log, stderr=subprocess.STDOUT)
    for _ in range(200):
        if proc.poll() is not None: raise RuntimeError("Lavik stopped during startup")
        try:
            client = Resp()
            assert client.command(["PING"]) == b"PONG"
            client.close()
            return proc, args
        except (OSError, AssertionError): time.sleep(.1)
    proc.kill(); proc.wait()
    raise TimeoutError("Lavik readiness timeout")


def run_case(definition):
    clients, captured = {}, {}
    result = {"name": definition["name"], "scope": definition["scope"], "steps": [], "status": "failed"}
    try:
        clients["default"] = Resp()
        assert clients["default"].command(["FLUSHALL"]) == b"OK"
        for instruction in definition["steps"]:
            key = instruction.get("connection", "default")
            if key not in clients: clients[key] = Resp()
            args = [captured[v["ref"]] if isinstance(v, dict) else v for v in instruction.get("argv", [])]
            iterations = []
            if instruction.get("scanAll"):
                found = []
                for _ in range(2048):
                    reply = clients[key].command(args)
                    assert isinstance(reply, list) and len(reply) == 2
                    iterations.append({"argv": normalize(args[:]), "actual": normalize(reply)})
                    found.extend(reply[1])
                    if reply[0] == b"0": break
                    args[1] = reply[0]
                else: raise TimeoutError("SCAN cursor did not finish")
                raw = sorted(set(found))
            else:
                raw = clients[key].read() if instruction.get("read") else clients[key].command(args)
            passed = matches(raw, instruction["expect"])
            result["steps"].append({**instruction, "actual": normalize(raw), "passed": passed, **({"iterations": iterations} if iterations else {})})
            if not passed: raise AssertionError("Reply did not satisfy assertion")
            if instruction.get("capture"): captured[instruction["capture"]] = raw
        result["status"] = "passed"
    except Exception as error:
        result["error"] = str(error)
    finally:
        for client in clients.values(): client.close()
    return result


def main():
    report = {"schemaVersion": 1, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "platform": platform.platform(), "architecture": platform.machine(), "status": "failed", "commands": []}
    server = None
    try:
        report["sourceCommit"] = Path("/opt/lavik/REVISION").read_text().strip()
        report["packageVersion"] = Path("/opt/lavik/VERSION").read_text().strip()
        report["binaryVersion"] = subprocess.check_output(["lavik", "--version"], text=True).strip()
        binary = Path(subprocess.check_output(["which", "lavik"], text=True).strip()).resolve()
        report["binarySha256"] = hashlib.sha256(binary.read_bytes()).hexdigest()
        assert report["sourceCommit"] == os.environ["EXPECTED_COMMIT"]
        assert report["binaryVersion"] == "lavik " + os.environ["EXPECTED_RELEASE"]
        assert report["packageVersion"].lstrip("v") == os.environ["EXPECTED_RELEASE"]
        with open("/tmp/manual-server.log", "w") as log:
            server, report["serverArgv"] = start(log)
            probe = Resp(authenticate=False)
            report["unauthenticatedGet"] = normalize(probe.command(["GET", "sample"]))
            assert "NOAUTH" in report["unauthenticatedGet"]["error"]
            report["badPassword"] = normalize(probe.command(["AUTH", "wrong-fixture-password"]))
            assert "WRONGPASS" in report["badPassword"]["error"]
            probe.close()
            for definition in build():
                result = run_case(definition)
                report["commands"].append(result)
                print(definition["name"] + ": " + result["status"], file=__import__("sys").stderr, flush=True)
            report["unsupported"] = []
            probe = Resp()
            for args in [["ACL", "LIST"], ["MEMORY", "USAGE", "key"], ["OBJECT", "ENCODING", "key"],
                         ["MOVE", "key", "1"], ["PFADD", "hll", "a"], ["PFCOUNT", "hll"], ["PFMERGE", "out", "hll"],
                         ["JSON.GET", "key"], ["FT.SEARCH", "index", "*"], ["HEXPIRE", "key", "60", "FIELDS", "1", "field"],
                         ["SPUBLISH", "channel", "message"], ["SSUBSCRIBE", "channel"], ["WAITAOF", "1", "0", "100"], ["ASKING"]]:
                actual = normalize(probe.command(args))
                assert isinstance(actual, dict) and "unknown command" in actual.get("error", "").lower()
                report["unsupported"].append({"argv": args, "actual": actual})
            probe.command(["SET", "manual:restart", "retained"])
            probe.close()
            server.send_signal(signal.SIGTERM)
            assert server.wait(timeout=30) == 0
            server, _ = start(log)
            probe = Resp()
            assert probe.command(["GET", "manual:restart"]) == b"retained"
            report["gracefulRestart"] = "passed"
            probe.close()
            report["status"] = "passed" if all(c["status"] == "passed" for c in report["commands"]) else "failed"
    except Exception as error:
        report["error"] = str(error)
    finally:
        if server and server.poll() is None:
            server.send_signal(signal.SIGTERM)
            try: server.wait(timeout=30)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        report["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
