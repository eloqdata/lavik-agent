# Experimental Procedure and Reproduction Notes

**English** | [中文](METHOD.zh-CN.md)

This document describes the methodology and controls used in the current report. It excludes earlier tuning experiments, candidate implementations, and optimization history.

## Versions and environment

- Lavik: `4b1eb143178955a033635964f291a6f471749d2d`; Bycorf: `150a50f87fe8ea61f2a2cb71ec28fb6e9b570e40`. Release build with GCC 13. Binary SHA-256 values are in the [build identity](provenance/build-identity.json).
- Azure Central US server: Standard_L16aos_v4, 16 vCPUs, 128 GiB RAM, AMD EPYC 9V74, and six local NVMe devices. Client: Standard_L32aos_v4, 32 vCPUs and 256 GiB RAM, accessing the server over its private network.
- The server uses CPUs 0–15 exclusively for the test. The client uses 32 threads and 320 connections. Only one database is tested at a time; peer databases do not run concurrently.
- Lavik: SPDK/VFIO storage, 2 GiB HugeTLB, ordinary TCP, and default `spdk-max-completions-per-poll=0`, verified with CONFIG GET at each startup. Normal engine maintenance remains enabled.
- Redis 8.10.2 and Valkey 9.1.2: in-memory configurations, AOF disabled, scheduled RDB saves disabled, and 8 configured I/O threads. Dragonfly 2.0.2: in-memory configuration with 16 proactor threads. Kvrocks 2.17.0: 16 workers, WAL enabled, sync disabled, and filesystem storage on the same six NVMe devices. Per-window `runtime_config` and INFO records under `provenance/peers/` provide configuration evidence.
- Persistence behavior differs across databases. This experiment does not establish equivalent power-loss durability or SLAs. Redis, Valkey, and Dragonfly were not tested at 200 GB.

## Data and requests

See [workloads.json](workloads.json) for complete parameters and the [Gaming PDF](sources/Gaming_Workloads_for_Lavik.pdf) for the source workloads.

1. **A: Global leaderboards.** Ten ZSETs, each containing 10 million members. Members are deterministic 32-byte strings; initial scores equal member ID × 1024, rather than sharing one score. Every database is loaded using sorted 8192-member ZADD batches, with one loading connection per key. The mix is 40% `ZREVRANGE 0 99 WITHSCORES`, 40% `ZRANK`, and 20% `ZINCRBY`. Increments are paired +2048/−2048, with each command counted separately. Write members are partitioned by connection to avoid concurrent updates to the same member. The 40/40 read split and ±2048 increments are experimental assumptions; the PDF does not require large score jumps.
2. **B: Match leaderboards.** Initially 1 million ZSETs with 50 members each, using distinct member IDs across matches. TTLs are 1800 seconds with staggered expirations. Thirty-two creation connections replenish approximately 555.56 leaderboards per second; 288 update connections issue `ZADD XX CH` to avoid accidentally recreating expired keys. The run lasts 1860 seconds, covering a complete TTL cycle. Creation QPS is a fixed arrival workload, not a performance ranking metric. Update throughput is compared alongside creation lateness, active key counts, expirations, and errors.
3. **C: Player state.** Ten million Hashes with 16 fields each and 128-byte field values, totaling 20.48 GB of logical user values. The mix is 90% `HGETALL` and 10% single-field `HSET f00`. Separate tests use 5% and 10% hot sets receiving 90% of requests. Each field value contains a 48-byte ASCII hexadecimal identity prefix and an 80-byte deterministic binary suffix, making the data compressible. Accessing the non-hot set does not necessarily require a physical read.
4. **C: 200 GB.** The same method scales to 100 million Hashes and 204.8 GB of logical user values. Only Lavik and Kvrocks are compared. Results are reported separately from the 20 GB dataset.

## Execution sequence

1. Pin the Lavik and Bycorf commits, finish compilation separately, and record server/client binary hashes. Save and verify the machines' existing data, then use separate loading and cleanup phases for testing.
2. Temporarily hold host timers for apt updates, firmware refresh, motd, temporary-file cleanup, man-db, logrotate, and fstrim on both machines, with an independent restoration mechanism. Wait for existing maintenance to finish. No perf recording, builds, or continuous system monitoring run during formal measurement windows.
3. Execute **A → C 20 GB → B → C 200 GB**. Reload data for each workload. Capture empty, loaded, and post-test memory, and validate data before and after formal measurements.
4. For each A/C configuration, warm up for 10 seconds and measure for 60 seconds, repeating three times with seeds 1108, 1109, and 1110. Finish the current command cycle after the measurement deadline to preserve the required command proportions. QPS uses actual `elapsed_s`, including this completion period. B runs for a full 31 minutes.
5. Outside the timing boundaries, read server commandstats and storage counters and wait for required write draining. Confirm that server command counts exactly match completed client commands. Every retained window has zero client errors.
6. Perform full validation: check every A member and score; traverse all C Hashes before and after measurement to verify complete content. Every timed C reply checks shape, lengths, and key/field/version identity; the binary suffix is fully checked once per 1024 reads per connection. Concurrently mutable fields may contain any self-consistent valid version. This is not a complete linearizability audit.
7. Record final memory, archive raw results, and match all 16 Lavik point JSON files against the raw client archive. Restore the original data and host maintenance timers. Leave both VMs running and stop the tested database service.

## Statistics and control sources

- A/C: median QPS across three runs. HTML mean-latency cells show the median of per-run means; P99 cells show the median of per-run P99 values, not a percentile computed from pooled requests. Raw point files retain P99.9, request counts, `elapsed_s`, and other fields.
- B: update QPS over the complete cycle. Creation and TTL metrics are listed separately.
- Per-command QPS is measured within the mixed workload and is affected by other commands and the fixed command cycles. In particular, Kvrocks A results do not establish standalone Top100 or ZINCRBY throughput limits.
- Memory is `cgroup_memory_bytes + hugetlb_bytes`, including reclaimable file page cache. Logical dataset size is not resident memory or physical disk usage.
- Lavik contributes 16 newly measured windows. The four peers reuse valid controls selected for this report with the same dataset sizes, command distributions, and 320 connections. Only those 46 control windows are included; previous Lavik runs and experiment history are excluded. See the [measurement dates](README.md#measurement-dates-and-limitations) and [sources.json](sources.json). This is not a same-day randomized crossover A/B test, so differences cannot be attributed entirely to one parameter.

## Load-generator sources and entry points

`harness/` contains the actual load-generator sources and measurement wrappers. Source files and binaries have separate hashes; changing compilers or dependencies may change binary hashes. The sources target Linux C++20 and use pthread and POSIX socket/epoll APIs.

```sh
mkdir -p bin
for name in workload workload-cperf load_a verify_a; do
  g++ -O3 -DNDEBUG -std=c++20 -pthread "harness/$name.cpp" -o "bin/$name"
done
./bin/workload --self-test
```

Formal short windows use `formal-case.py`: A runs `workload`, while C runs `workload-cperf`. The latter uses the timed validation sampling described above while preserving the dataset and request definitions. `clean_b_suite_lib.py` records loading, pre/post validation, repeated measurements, and TTL alignment. `churn-case.py` is the formal B entry point; `snapshot.py` captures cgroup/HugeTLB memory.

These are **recorded execution scripts, not a general cloud deployment tool**. `/opt/gaming-main-20261111`, private addresses, systemd units, and device-configuration paths belong to the original environment and must be adapted for another deployment. The `common` module used by `clean_b_suite_lib.py` is a remote execution adapter; SSH identities and authorization-management code are not published here. Supply your own SSH/local execution adapter when using that workflow. Do not run its FLUSHDB operations against production data.

Exact formal short-window arguments are preserved in each window's `result.json.args` inside `raw/load-results.tar.gz`. Examples:

```sh
./bin/workload --host SERVER_IP --workload A --phase run \
  --keys 10 --members 10000000 --connections 320 --threads 32 \
  --seconds 60 --hot-percent 5 --seed 1108 --out result.json
./bin/workload-cperf --host SERVER_IP --workload C --phase run \
  --keys 10000000 --members 10000000 --connections 320 --threads 32 \
  --seconds 60 --hot-percent 5 --seed 1108 --out result.json
```

Each example runs only one window against an already loaded dataset. Complete reproduction also requires loading, warmup, three repetitions, pre/post validation, and count verification as described above. The recorded server launch example is `harness/start-product.sh`; it omits the SPDK completion-cap flag and uses the pinned main commit's default of 0.

## Files and verification

- `data/gaming/points/`: A/B and 20 GB C comparisons. `data/c200/points/`: 200 GB C.
- Corresponding `memory/` directories: loaded and post-test snapshots. `data/lavik-init/`: current loading and full pre/post validation records.
- `raw/`: only the current Lavik A/B/C initialization, formal windows, and server logs. Earlier diagnostics and backups are excluded. Selected peer result records, configurations, and memory evidence are included, but their entire historical log archives are not repackaged here.
- `provenance/`: build identity, observed default settings, completion/archive verification records, and database INFO.
- `SHA256SUMS`: SHA-256 values for every delivered file except the checksum list itself. Run `sha256sum -c SHA256SUMS` to verify a downloaded directory.
