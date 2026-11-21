Single-node Hash benchmark · November 21, 2026

# 12.5× as many records, 61.1% higher throughput: Lavik at 1 billion vs. Redis at 80 million

On the same 16-vCPU server, Lavik sustained **621,528 operations per second** across one billion Hash records backed by local NVMe. Redis averaged **385,755 operations per second** across 80 million records in memory. Both runs used 256 connections and sampled keys uniformly across their full datasets.

## At 80 million records, Lavik led on throughput

At the shared dataset size, Lavik delivered 63.7% more throughput than Redis and 17.6% more than Dragonfly. Redis and Lavik had nearly identical 99.9th-percentile read latency, about 2.6 ms. Lavik’s write latency at the same percentile was 0.56 ms lower. Dragonfly averaged 537,054 ops/s, with read and write P99.9 of 12.66 and 13.08 ms.

| Database | Records | Connections | Ops/s | Read P99.9 (ms) | Write P99.9 (ms) | Memory¹ (GiB) |
| --- | --- | --- | --- | --- | --- | --- |
| Redis 8.10.3 | 80,000,000 | 256 | 385,755 | 2.553 | 2.627 | 100.2 |
| Dragonfly v2.1 | 80,000,000 | 256 | 537,054 | 12.655 | 13.076 | 101.5 |
| Lavik v0.3.2 | 80,000,000 | 256 | 631,666 | 2.565 | 2.063 | 6.3 |
| Lavik v0.3.2 | 1,000,000,000 | 256 | 621,528 | 2.610 | 2.132 | 55.7 |

¹ Each engine’s reported memory usage after measurement. Accounting varies by engine.

## Growing Lavik’s dataset 12.5× cost 1.6% in throughput

Each record held eight 128-byte field values. Growing from 80 million to one billion records increased the field-value payload from 81.92 GB to **1.024 TB**. Lavik retained 98.4% of its smaller-dataset throughput. Read P99.9 rose by 0.045 ms and write P99.9 by 0.069 ms.

Loading all one billion records took 17.0 minutes of cumulative loading time. Before measurement, Lavik reported zero pending durability work and zero dirty staging bytes. Space available for foreground writes had fallen by 1.305 TB relative to the empty database, including engine overhead. After measurement, Lavik reported 55.7 GiB of memory usage.

The headline compares the two dataset sizes actually tested. Redis ran at 80 million records for the three-way comparison. Its throughput ranged from 337,159 to 410,254 ops/s across three runs. Even against Redis’s fastest run, Lavik’s billion-record average was 51.5% higher.

## How the test ran

Each database ran alone on an Azure Standard\_L16aos\_v4 in Central India Zone 3, with 16 vCPUs and 128 GiB of RAM. Fourteen vCPUs served the database and two handled the operating system and network interrupts. A separate Standard\_F16als\_v6 generated load in the same zone. Both machines used accelerated networking.

Redis and Dragonfly ran in memory with a 112 GiB limit, eviction disabled and periodic snapshots disabled. Redis AOF was off. Lavik stored Hash values on local NVMe without an in-memory data cache. It used io\_uring on a raw RAID 0 partition spanning six local NVMe drives, with a 96 GiB engine memory limit.

YCSB read the entire Hash in 95% of operations and updated all eight fields in the remaining 5%. All engines used `HGETALL` for reads. Lavik’s YCSB binding issued `LAVIK.HREPLACE` to replace the entire Hash without reading its previous field values from NVMe. The Redis binding issued `HMSET` for Redis and Dragonfly with `redis.scanindex=none`. Loading used 64 pipelined connections with batches of 32. During measurement, each of the 256 connections issued one request at a time.

## Results by run

After warmup, each configuration ran for three 60-second windows. The summary reports the arithmetic mean of the three throughput values and of the three per-window latency percentiles. All measured reads and updates succeeded. Before and after each configuration, the test checked the key count and verified field names and lengths in 1,003 sampled records.

| Database | Records | Run | Ops/s | Read P99.9 (ms) | Write P99.9 (ms) |
| --- | --- | --- | --- | --- | --- |
| Redis 8.10.3 | 80 million | 1 | 337,159 | 2.607 | 2.711 |
| Redis 8.10.3 | 80 million | 2 | 410,254 | 2.547 | 2.617 |
| Redis 8.10.3 | 80 million | 3 | 409,853 | 2.505 | 2.553 |
| Dragonfly v2.1 | 80 million | 1 | 540,583 | 9.839 | 10.223 |
| Dragonfly v2.1 | 80 million | 2 | 537,099 | 13.407 | 13.855 |
| Dragonfly v2.1 | 80 million | 3 | 533,482 | 14.719 | 15.151 |
| Lavik v0.3.2 | 80 million | 1 | 627,763 | 2.647 | 2.077 |
| Lavik v0.3.2 | 80 million | 2 | 634,695 | 2.557 | 2.055 |
| Lavik v0.3.2 | 80 million | 3 | 632,541 | 2.491 | 2.057 |
| Lavik v0.3.2 | 1 billion | 1 | 629,384 | 2.559 | 2.019 |
| Lavik v0.3.2 | 1 billion | 2 | 623,499 | 2.739 | 2.211 |
| Lavik v0.3.2 | 1 billion | 3 | 611,701 | 2.531 | 2.165 |

[Raw YCSB logs, histograms and reproduction scripts](lavik-india-standalone-ycsb-evidence.tar.gz)