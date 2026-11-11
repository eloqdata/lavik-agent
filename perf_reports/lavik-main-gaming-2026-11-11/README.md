# Lavik main Gaming Workload Report · 2026-11-11

**English** | [中文](README.zh-CN.md)

This directory documents the current comparison: Lavik main `4b1eb143178955a033635964f291a6f471749d2d`, with Bycorf `150a50f87fe8ea61f2a2cb71ec28fb6e9b570e40`. All 16 formal Lavik measurement windows completed with zero errors, and their result records were verified against the raw archive.

- [White-background overview](report.html) / [Full command, latency, and memory report](all-results.html): download this directory and open the HTML files in a browser. GitHub file pages display their source.
- [Procedure, parameters, and reproduction notes](METHOD.md) / [Machine-readable workload definitions](workloads.json)
- [Per-window sources](sources.json) / [Raw log archives](raw/manifest.json) / [File checksums](SHA256SUMS)

The server has 16 vCPUs, 128 GiB RAM, and six local NVMe devices. A separate client uses 32 threads and 320 connections. Lavik uses 2 GiB HugeTLB and the default SPDK completion cap of 0, verified with CONFIG GET at each startup. Peer results are the comparable control measurements selected for this report, with their actual collection dates preserved; **the four peers were not rerun on November 11**. Previous Lavik runs, parameter experiments, and optimization history are excluded.

## Workload

| Workload | Dataset | Command mix |
|---|---|---|
| A: Global leaderboards | 10 ZSETs × 10 million members | 40% Top100 WITHSCORES, 40% ZRANK, 20% ZINCRBY ±2048 |
| B: Match leaderboards | 1 million ZSETs × 50 members; 30-minute TTL | Continuous creation, updates, and expiration over a full 31-minute run |
| C: Player state | 10 million Hashes × 2 KB; 20.48 GB | 90% HGETALL, 10% HSET; 5% / 10% hot sets |
| C: Large dataset | 100 million Hashes; 204.8 GB | Lavik and Kvrocks only; same read/write and hot-set proportions |

## Throughput

A/C show total mixed-workload QPS, using the median of three runs. B shows update QPS over one complete cycle.

| Workload | Lavik | Redis | Valkey | Dragonfly | Kvrocks |
|---|---:|---:|---:|---:|---:|
| A | 111,905 | 176,688 | 171,251 | 513,816 | 32 |
| B | 349,862 | 303,206 | 375,862 | 984,498 | 79,203 |
| C, hot set 5% | 737,898 | 276,182 | 185,996 | 721,894 | 203,128 |
| C, hot set 10% | 737,645 | 266,354 | 182,538 | 726,992 | 209,446 |
| C 200 GB, hot set 5% | 752,019 | Not tested | Not tested | Not tested | 97,272 |
| C 200 GB, hot set 10% | 711,936 | Not tested | Not tested | Not tested | 89,520 |

## Per-command QPS

These are completion rates within the mixed workload, not standalone command throughput limits. See the [full report](all-results.html) for mean latency, P99, and per-run sources.

| Workload / command | Lavik | Redis | Valkey | Dragonfly | Kvrocks |
|---|---:|---:|---:|---:|---:|
| A / Top100 | 44,762 | 70,675 | 68,501 | 205,526 | 13 |
| A / ZINCRBY | 22,381 | 35,338 | 34,250 | 102,763 | 6 |
| A / ZRANK | 44,762 | 70,675 | 68,501 | 205,526 | 13 |
| B / PEXPIRE_create | 556 | 556 | 556 | 556 | 556 |
| B / ZADD_XX_CH | 349,862 | 303,206 | 375,862 | 984,498 | 79,203 |
| B / ZADD_create | 556 | 556 | 556 | 556 | 556 |
| C, hot set 5% / HGETALL_cold | 66,401 | 24,870 | 16,746 | 65,002 | 18,295 |
| C, hot set 5% / HGETALL_hot | 597,706 | 223,694 | 150,650 | 584,703 | 164,520 |
| C, hot set 5% / HSET_cold | 7,375 | 2,762 | 1,866 | 7,210 | 2,032 |
| C, hot set 5% / HSET_hot | 66,395 | 24,858 | 16,733 | 64,988 | 18,281 |
| C, hot set 10% / HGETALL_cold | 66,421 | 23,978 | 16,420 | 65,424 | 18,859 |
| C, hot set 10% / HGETALL_hot | 597,459 | 215,741 | 147,865 | 588,869 | 169,642 |
| C, hot set 10% / HSET_cold | 7,373 | 2,672 | 1,820 | 7,257 | 2,093 |
| C, hot set 10% / HSET_hot | 66,397 | 23,963 | 16,433 | 65,443 | 18,846 |
| C 200 GB, hot set 5% / HGETALL_cold | 67,679 | Not tested | Not tested | Not tested | 8,760 |
| C 200 GB, hot set 5% / HGETALL_hot | 609,139 | Not tested | Not tested | Not tested | 78,785 |
| C 200 GB, hot set 5% / HSET_cold | 7,533 | Not tested | Not tested | Not tested | 969 |
| C 200 GB, hot set 5% / HSET_hot | 67,669 | Not tested | Not tested | Not tested | 8,759 |
| C 200 GB, hot set 10% / HGETALL_cold | 64,095 | Not tested | Not tested | Not tested | 8,057 |
| C 200 GB, hot set 10% / HGETALL_hot | 576,647 | Not tested | Not tested | Not tested | 72,512 |
| C 200 GB, hot set 10% / HSET_cold | 7,105 | Not tested | Not tested | Not tested | 895 |
| C 200 GB, hot set 10% / HSET_hot | 64,089 | Not tested | Not tested | Not tested | 8,057 |

## Memory

GiB, after loading / after testing; ordinary cgroup memory (including reclaimable page cache) plus HugeTLB.

| Workload | Lavik | Redis | Valkey | Dragonfly | Kvrocks |
|---|---:|---:|---:|---:|---:|
| A | 3.18 / 3.21 | 10.46 / 9.83 | 9.57 / 9.58 | 7.23 / 7.37 | 33.73 / 33.69 |
| B | 2.55 / 2.64 | 2.06 / 2.87 | 2.07 / 3.03 | 2.05 / 2.72 | 16.83 / 29.42 |
| C | 3.17 / 3.19 | 29.82 / 29.81 | 31.78 / 31.67 | 29.41 / 29.40 | 49.57 / 44.35 |
| C 200 GB | 8.78 / 8.79 | Not tested | Not tested | Not tested | 121.77 / 121.71 |

## Measurement dates and limitations

| Database | China Standard Time (UTC+8) | Formal windows |
|---|---|---:|
| Lavik main | 2026-11-11 21:06 — 2026-11-11 22:05 | 16 |
| Redis 8.10.2 | 2026-11-07 14:17 — 2026-11-07 23:50 | 10 |
| Valkey 9.1.2 | 2026-11-07 15:18 — 2026-11-08 00:24 | 10 |
| Dragonfly 2.0.2 | 2026-11-07 16:19 — 2026-11-07 17:13 | 10 |
| Kvrocks 2.17.0 | 2026-11-07 17:40 — 2026-11-10 20:20 | 16 |

Redis, Valkey, and Dragonfly use in-memory configurations; Lavik and Kvrocks use storage engines. Their persistence policies are not equivalent. C uses compressible structured data; “cold” denotes the non-hot set and does not guarantee a physical read on every access. B has a fixed creation rate, so creation QPS is not used to rank performance. Findings apply only to the workloads and environment documented here.
