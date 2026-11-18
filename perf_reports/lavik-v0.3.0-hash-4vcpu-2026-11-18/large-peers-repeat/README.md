# 100M peer rerun on retained Azure allocation · 2026-11-18

Kvrocks and Dragonfly were measured sequentially on the currently running 4-vCPU /32-GiB server, without VM shutdown or reallocation. Each dataset has 100,000,000 configured records × 8 fields × 128 B, or 95.367 GiB of field values. All runs use native binaries, 128 business connections, the pinned unmodified Redis YCSB binding, no scan index, no throttling, and full-field HMSET/HGETALL.

**Five points / 15 measured windows passed independent raw-log audit.** Dragonfly A returned `ERR Out of memory` during warmup; no measured A window or throughput mean exists. Redis RAM mode is excluded because the field values alone exceed server memory; no Redis 100M failure was experimentally asserted.

Each valid point has 60-second warmup and three 60-second measurements. Table throughput and P99.9 are arithmetic means of the three per-run values, not pooled percentiles.

| Product | Workload | Mean ops/s | READ P99.9 ms | UPDATE P99.9 ms |
|---|---|---:|---:|---:|
| kvrocks | C | 23,078 | 10.415 | — |
| kvrocks | B | 21,904 | 14.722 | 15.116 |
| kvrocks | A | 14,733 | 30.356 | 30.154 |
| dragonfly | C | 230,138 | 1.898 | — |
| dragonfly | B | 220,682 | 4.946 | 5.247 |
| dragonfly | A | Warmup OOM | — | — |

C=pure read;B=95%read/5%update;A=50%read/50%update. Full-precision means,individual repeats and additional latency statistics are in [results.csv](results.csv).

## Acquisition and validation

Both engines completed exactly 100,000,000 successful INSERT operations and passed 1,003-key field-shape/no-index samples. No DBSIZE,KEYS or SCAN was issued. Successful load counts are not an independent exact server key-count scan. Kvrocks was measured only after three consecutive 10-second INFO checks showed zero running/pending compaction and zero estimated debt. Initial post-load compaction debt exceeded 150 GB; waiting receipts are archived.

Dragonfly uses `--tiered_experimental_hash_support=true --listpack_max_field_len=256 --listpack_max_bytes=2048` with SSD tiering, 24 GiB maxmemory and 28 GiB cgroup memory cap. Nonzero INFO TIERED counters verify offloading. C/B completed all three windows and post-point samples; A failed in warmup. No final post-A sample is claimed.

Timestamped 1 Hz `iostat -x -y -t` covers the acquisition. Window-level INFO and cgroup CPU/memory/I/O snapshots are retained. These completed measurements establish observed performance in this run; they do not independently prove stable underlying Azure storage or identify the cause of earlier NVMe variation.

The parent main table now uses this rerun for Kvrocks/Dragonfly 100M. **Lavik 100M remains from the earlier allocation**, because the user prioritized the other engines and paused Lavik investigation. Do not interpret that mixed-provenance 100M table as a new controlled same-allocation Lavik-versus-peer experiment. The original results remain archived; no averages combine old and new windows. Both VMs remain running, and Lavik's existing data is retained.

## Reproduction and evidence

Use the parent native setup,source lock and versions. This directory's `scripts/campaign.py` runs only Kvrocks100M then Dragonfly100M with C/B/A. The original 8 GiB Kvrocks cache, 4 workers and memory budgets are unchanged. No container is used.

```bash
sha256sum -c SHA256SUMS
cat raw/raw.tar.xz.part-* > raw.tar.xz
echo "3dc12225a962d9fa091b915f9f7a955a68a6c4e40ab1fff3c00cba688677e883  raw.tar.xz" | sha256sum -c -
tar -xJf raw.tar.xz
python3 scripts/verify-evidence.py raw/same-host-peers-100m --out verified.json
```

The archive is 8,346,660 bytes split into four parts; `manifest.json` records 288 raw files and their SHA-256s. The audit reports 5 valid points, 15 valid windows, one recorded warmup OOM, and zero unexplained audit errors. Logs,source-independent binary launch settings,sample receipts,HDR files,compaction readiness and server I/O telemetry are included. Credentials and database data files are excluded.
