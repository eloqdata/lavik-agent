# NVMe fio diagnosis and partial SPDK results · 2026-11-18

**本轮 fio 未复现之前的读延迟恶化，不能据此断定坏盘，也不能排除此前 Azure 的瞬时波动。** On the same still-running Azure allocation, all 30 measured fio windows completed without reported I/O errors. A subsequent fresh Lavik SPDK 10M B diagnostic remained slow. This report does not establish a hardware or software root cause.

## fio results

Native fio 3.36, Linux io_uring with direct I/O, CPUs 0–3. Each point is three 60-second measurements after a 5-second ramp; arithmetic means below. Percentiles are means of per-run percentiles, not pooled. These are device IOPS, not YCSB operations/s. Completion latency includes queueing and completion handling.

| Case | Total read QD | Mean read IOPS | Mean read clat (µs) | Mean read p99.9 (µs) |
|---|---:|---:|---:|---:|
| 4 KiB random read | 1 | 14,865 | 66.2 | 85.2 |
| 4 KiB random read | 32 | 429,937 | 72.8 | 261.1 |
| 4 KiB random read | 128 | 431,414 | 295.3 | 741.4 |
| 8 KiB random read | 128 | 299,055 | 426.5 | 643.1 |
| Mixed-size reads, before writes | 128 | 431,414 | 295.3 | 544.8 |
| Same reads + 8 MiB/s append | 128 | 431,282 | 295.4 | 544.8 |
| Same reads + append + fsync | 128 | 431,281 | 295.4 | 544.8 |
| Same reads, after writes | 128 | 431,412 | 295.3 | 544.8 |
| Same reads + append + explicit NVMe Flush at 64 Hz | 128 | 431,282 | 295.4 | 544.8 |
| Same reads, after explicit Flush test | 128 | 431,414 | 295.3 | 544.8 |

The mixed-size cases use 70% 4 KiB / 30% 8 KiB random reads, four reader jobs at depth 32 each. The writer uses sequential 128 KiB blocks, depth 4, at 8 MiB/s. Three crossover cycles pair each write treatment with surrounding read-only measurements. This tests a controlled small-append condition; it does not exactly reproduce Lavik's request timing, read/write addresses, queue ownership or SPDK poll loop.

Read range: offset 1 GiB, length 8 GiB of existing Lavik data; 16 distributed 4 KiB samples were nonzero. Write range: offset 2 TiB, length 1 GiB on the explicitly authorized disposable scratch NVMe. Lavik was stopped. Subsequent Lavik tracing reset and reloaded the scratch device. OS disk was not modified.

The virtual NVMe reports VWC=0 and write-through. Kernel fsync did not produce device flush requests in iostat, so a separate helper issued NVMe opcode 0x00 directly at 64 Hz; all returned success. Pinned Bycorf skips the ordinary SPDK fdatasync hardware flush when VWC=0. Therefore this explicit-Flush treatment is a diagnostic stress control, not a claim that Lavik ordinarily emits Flush at this frequency.

Read throughput is near the [published L4aos_v5 limits](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/storage-optimized/laosv5-series) (431,250 read IOPS, 2,440 MB/s). These are sizing references, not a latency SLA. SMART/error-log snapshots showed no reported media errors or critical warnings; virtual-device telemetry is limited and cannot certify the underlying physical SSD.

## Lavik backend correction and partial results

Previous report tables used **Minimal / io_uring**, despite the requested SPDK setup. They are explicitly marked historical. The new setup uses the official **Standard v0.3.0 / SPDK** binary, kernel networking, four workers, 24 GiB engine budget, 26 GiB ordinary-memory cgroup limit plus 2 GiB reserved hugepages. Scratch PCI `97b2:00:00.0`, serial `0baff889821a310b0001`, namespace 1 is bound to vfio-pci; startup receipts verify `storage=spdk`. The only scratch device is approximately 2.62 TiB. The OS device is separate and excluded.

Completed formal SPDK points before the fio interruption:

| Records | Workload | Mean operations/s | Mean READ p99.9 |
|---|---|---:|---:|
| 10M | C: 100% read | 391,056 | 0.656 ms |
| 10M | B: 95% read / 5% update | 75,875 | 2.740 ms |

Each is three 60-second unlimited runs with 128 connections, 8×128B fields, uniform keys, updated unmodified YCSB Redis binding and `redis.scanindex=none`. A's first measured window was interrupted for fio diagnosis and is excluded; 100M SPDK was not started. This is **not a completed SPDK comparison**. All 180 one-second B INFO samples reported `defrag_active=0` and `defrag_pending=0`; active defrag does not explain that observed B slowdown.

After fio, a fresh 10M load and three B windows with 1/64 latency tracing were acquired to locate delay. Mean throughput was 75,866 operations/s. Mean sampled READ `read_io` was 1,602.6 / 1,586.9 / 1,593.3 µs across the three runs, while the retained recent HGETALL traces spent about 99% of total time there. These are diagnostic results, not replacements for formal non-traced measurements. See `trace-analysis.json` for the analysis and sampling limitations. The `read_io` stage covers submission through completion/resumption, including software polling/scheduling, so it is not an isolated hardware latency measurement.

## Reproduction and evidence

`raw.tar.xz` contains the exact per-run fio configurations and invocations, JSON outputs, per-second logs, iostat, controller identity and health snapshots; interrupted SPDK formal logs; SPDK startup/reset receipts; and the fresh tracing run. `manifest.json` lists SHA-256 and length for every archived file. No database contents or private SSH keys are included. Both Azure VMs remain running.

```sh
sha256sum -c SHA256SUMS
mkdir extracted
tar -xJf raw.tar.xz -C extracted
python3 scripts/audit.py extracted/raw/server --out recomputed.json
python3 scripts/analyze-traces.py extracted/raw --out recomputed-traces.json
```

Acquisition scripts require the same dedicated disposable scratch device and paths. The scripts assert its identity; do not substitute an arbitrary device. On the server, stop Lavik and rebind only the scratch controller to the kernel NVMe driver before fio. Install fio 3.36, nvme-cli, sysstat and a C compiler. Compile `nvme-flush.c` with `cc -O2 -Wall -Wextra -o /opt/bench/nvme-flush nvme-flush.c`. Run `read-matrix.py`, then `mixed-crossover.py`, then `direct-flush.py`, sequentially. Output folders must be fresh. Each script records exact commands. The scripts use `/opt/bench` and sudo/root access for raw NVMe. For SPDK, use `prepare-server.py` and `server-control.py`; **reset destroys the scratch data**. Client `trace-b.py` resets, reloads exactly 10M successful INSERTs, checks 1,003 key samples without DBSIZE/SCAN/KEYS, warms up, traces three B windows, then stops Lavik cleanly. See archived launch receipts and scripts for pinned source IDs and all settings.

Sources: [Lavik tracing documentation](https://github.com/eloqdata/lavik/blob/v0.3.0/docs/operations/metrics.md), [pinned Bycorf SPDK implementation](https://github.com/eloqdata/bycorf/blob/150a50f87fe8ea61f2a2cb71ec28fb6e9b570e40/src/io/spdk_storage.cpp). Further isolation would compare kernel and SPDK direct-I/O controls on matching addresses and queue topology, or instrument submission, hardware completion polling and coroutine resumption separately. The current evidence does not justify calling the device faulty.
