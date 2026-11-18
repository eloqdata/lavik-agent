# Native 4-vCPU Hash YCSB comparison · 2026-11-18

Status: all four native 1M-record preflights passed; the formal campaign is running. Formal comparison results are pending.

This experiment compares Lavik v0.3.0, Apache Kvrocks 2.17.0, Dragonfly v2.1 and Redis 8.10.3. All run as native processes, one at a time on the same Azure server. No container measurements enter the formal results.

## Protocol

- Server: Azure `Standard_L4aos_v5`, East US zone 3; 4 vCPUs / 32 GiB, AMD EPYC 9V45, local NVMe, Ubuntu 24.04, Linux 7.0.0-1017-azure. The topology is two physical cores with two threads/core, not four physical cores.
- Client: separate `Standard_L16aos_v5` in the same zone and private subnet; 16 vCPUs. Retail compute quotes at preparation: $0.610/hour server and $2.438/hour client; disks and network excluded.
- Datasets: 10M and 100M configured records, each with eight 128-byte field values. Logical field-value payloads are 9.537 and 95.367 GiB; keys, field names and overhead are additional.
- YCSB: `eloqdata/YCSB` commit `247a2d448ebceff11a570a622c49ece161a27ed3`. Use the **Redis binding for all four products**, `redis.scanindex=none`, uniform keys, full-field reads/updates, no scans, no TTL, no pipeline.
- Commands: `HMSET` loads/updates eight fields; `HGETALL` reads all fields. No `_indices` sorted set or index maintenance; no Lavik-specific replacement command.
- Concurrency: 128 business connections, one per YCSB worker, for loading, warmup and measurement; one additional persistent control/sampling connection. All formal runs are unlimited; no target-rate option is passed to YCSB.
- Workloads A/B/C: 50/50 read/update, 95/5 read/update, and read-only. Products run sequentially. Each product/dataset runs in C/B/A order; the schedule is archived.
- Each point: 60-second warmup, then **three independent 60-second measured runs**, fresh JVM per run. Report the arithmetic mean of three successful QPS values plus all individual values. Any averaged latency quantile is explicitly the mean of three per-run percentiles, not a pooled percentile.
- A/B/C update existing keys and do not insert new records during measurements. All-field values remain 128 bytes.
- Memory: each service cgroup has `MemoryMax=28G`, `MemorySwapMax=0`; engine limits are 24 GiB where available. Kvrocks uses an 8 GiB block cache. Four CPUs cover each service and its background threads. Eviction and swap are disabled.
- Primary memory baselines have AOF and scheduled snapshots disabled. Native storage engines retain documented storage maintenance. These configurations do **not** establish equal power-loss durability.

10M is the common in-memory-sized comparison. At 100M, run Lavik, Kvrocks and explicitly labeled Dragonfly experimental Hash tiering (`--tiered_prefix` and `--tiered_experimental_hash_support=true`). Verify that actual offloading occurs. Redis in-memory mode cannot be treated as a complete-dataset throughput comparison when it cannot retain the full dataset. Do not silently substitute caching/eviction or a smaller dataset.

Seven feasible product/configuration/dataset pairs × three workload points × (60-second warmup + three 60-second runs) is 1.4 hours before loading and setup. One-minute windows do not establish long-term compaction or cleaning steady state. Product order is fixed, and repetitions are consecutive; disclose that limit.

## Native builds and deployment

`build-native.sh` builds Redis and Kvrocks on the client outside measurement windows. It records binary SHA-256s, version strings and dynamic-library dependencies. Lavik uses the SHA-256-verified v0.3.0 x86_64 minimal release archive; Dragonfly uses its v2.1 x86_64 release archive. Record archive SHA-256s for both.

Use `provision-azure.sh` with your own `PUBLIC_KEY_FILE` and `ADMIN_CIDR` to provision a fresh resource group. Install native dependencies with `install-deps.sh` as root on each host. The verified empty local NVMe was formatted as ext4 with `lazy_itable_init=0,lazy_journal_init=0` before mounting, outside all measured windows. Apply `swapoff -a`, `vm.overcommit_memory=1` and THP `never` consistently before acquisition.

The dedicated server expects executables and configuration at:

```
/opt/bench/bin/redis-server
/opt/bench/bin/kvrocks
/opt/bench/kvrocks-default.conf
/opt/bench/lavik-release/lavik-v0.3.0-linux-x86_64-minimal/lavik
/opt/bench/dragonfly-release/dragonfly-x86_64
```

The server's verified empty local NVMe is mounted as `/mnt/bench`. `server-control.py` creates fresh per-dataset directories, starts native systemd services, records exact launch arguments, and rejects starting a peer while another database is active. Lavik's new file is a sparse 512 GiB storage file. Reproduction must identify its own empty scratch device; these scripts do not format a disk.

On the Linux client, install Java 17, Maven, Python 3 plus `python3-redis`, SSH, and sysstat. Stage the source checkout:

```bash
curl -fL https://codeload.github.com/eloqdata/YCSB/tar.gz/247a2d448ebceff11a570a622c49ece161a27ed3 -o ycsb-source.tar.gz
mkdir -p /opt/bench/YCSB-247a2d4
tar -xf ycsb-source.tar.gz --strip-components=1 -C /opt/bench/YCSB-247a2d4
cd /opt/bench/YCSB-247a2d4
mvn -B -Psource-run -pl site.ycsb:redis-binding -am clean package
```

Place `run.py`, `verify.py`, `common.properties`, and `campaign.py` under `/opt/bench/kit/`. Put `server-control.py` and `capture-server.py` on the server under `/opt/bench/`. Adapt the private server address (`10.83.0.4`), SSH account and paths before reproduction. The client's `/opt/bench/server-key` must be a locally supplied private key authorized for the dedicated benchmark server; no private key is published.

Preview a single run:

```bash
python3 /opt/bench/kit/run.py --ycsb-root /opt/bench/YCSB-247a2d4 \
  --host 10.83.0.4 --product lavik --records 10000000 \
  --phase measure --workload B --threads 128 --target 0 \
  --seconds 60 --label n10m-B-unlimited-r1
```

The default only prints the command. Add `--execute` to run after a valid load. `--target 0` removes throttling. `campaign.py` implements the full sequential schedule and controls the server over SSH. Each invocation records exact arguments, complete YCSB output, HDR logs, status counts and successful QPS. A failed worker or absent complete measurements invalidates a run even if the Java launcher exits zero.

## Validation without key-count scans

**No `DBSIZE`, `DBSIZE SCAN`, `KEYS`, or `SCAN` runs after loading.** Check the exact successful INSERT count from the YCSB load receipt, then use `verify.py` to probe fixed/distributed keys generated with the same YCSB FNV key naming. Check 1,003 samples for exactly eight expected fields and 128-byte values, retain per-key hashes, and check that `_indices` is absent. Recheck field shape after each point.

Configured record count and successful load operations are not an independently measured exact server key count. Preserve that distinction in results. Formal runs require zero failed statuses, worker exceptions and missing reads. Retain unsuccessful runs separately.

Record ordinary latency statistics and retain intended-start histograms as emitted by YCSB. Report actual successful QPS; there is no target-rate attainment comparison. Capture client/server sysstat, cgroup CPU/memory/I/O counters and engine INFO snapshots outside measured windows.

## Evidence layout

- `scripts/`: executable reproduction sources and common properties.
- `metadata/`: source lock, sanitized environment and normalized measurements.
- `raw.tar.gz`: formal native load/warmup/measured logs, HDR histograms, sampling receipts and telemetry; created after execution.
- `SHA256SUMS`: checksums of checked-in evidence; created when packaging.

Credentials, SSH keys, database files and earlier container pilot results are excluded. Results remain pending until the formal acquisition and checks finish.

## Protocol update

The user removed all rate-limited tests before the final campaign. Earlier mixed-rate logs are excluded. The final unlimited-only campaign starts each product/dataset from a fresh load, avoiding write-history differences introduced by the interrupted protocol. The original completed read-only unlimited point is preserved as a superseded observation, outside the final mean tables. Formal outputs live under `/opt/bench/formal-unlimited-native`.
