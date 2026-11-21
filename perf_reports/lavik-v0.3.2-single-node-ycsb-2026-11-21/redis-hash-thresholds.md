# Redis Hash encoding at 65 million and 80 million records

On the same Azure L16aos_v4 database VM, the published tuned Redis run at 80 million records averaged 385,755 ops/s, 9.7% above the 351,594 ops/s measured at 65 million with the default Hash thresholds. The latter had lower read and update P99.9.

| Redis configuration | Records | Max listpack field value (bytes) | Ops/s | Read P99.9 (ms) | Update P99.9 (ms) | Redis used memory after test (GiB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Default | 65,000,000 | 64 | 351,594 | 2.396 | 2.418 | 103.52 |
| Tuned | 65,000,000 | 256 | 406,632 | 2.488 | 2.500 | 81.24 |
| Published tuned | 80,000,000 | 256 | 385,755 | 2.553 | 2.627 | 100.23 |

At a matched 65 million records, changing only the Hash value threshold from 64 to 256 bytes in the benchmark configuration changed throughput by +15.7% and Redis used memory by -21.5%. Each run started with an empty instance. The default run loaded in capacity-check stages; the tuned control loaded directly to 65 million. Both used the same key range, field shape, value generator, 64 loader connections and pipeline depth of 32. Redis returned `hashtable` for a sampled key with the default threshold and `listpack` with the raised threshold. Each record had eight 128-byte fields. The entry-count threshold remained at its default of 512 throughout.

After the three default-threshold measurements, we continued loading toward 80 million records under the same 112 GiB maxmemory/noeviction policy. Redis returned an OOM error and DBSIZE reported 69,722,120 keys after the loader stopped. This is an observed capacity check for this workload.

All configurations used Redis 8.10.3 with 14 I/O threads on CPUs 0–13. A separate F16als_v6 client ran YCSB Workload B with the Redis binding, scan indexing disabled, 256 unpipelined connections and uniform access to each entire dataset. Reads fetched the entire Hash and updates replaced all eight fields. Each configuration ran a 30-second warmup followed by three 60-second measurement windows. Throughput and P99.9 are arithmetic means of the window results. All measured operations succeeded and no keys were evicted.

| Redis configuration | Records | Window | Ops/s | Read P99.9 (ms) | Update P99.9 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Default | 65,000,000 | 1 | 352,683 | 2.491 | 2.509 |
| Default | 65,000,000 | 2 | 351,573 | 2.341 | 2.377 |
| Default | 65,000,000 | 3 | 350,526 | 2.357 | 2.367 |
| Tuned | 65,000,000 | 1 | 407,885 | 2.449 | 2.449 |
| Tuned | 65,000,000 | 2 | 403,139 | 2.475 | 2.467 |
| Tuned | 65,000,000 | 3 | 408,873 | 2.539 | 2.585 |
| Published tuned | 80,000,000 | 1 | 337,159 | 2.607 | 2.711 |
| Published tuned | 80,000,000 | 2 | 410,254 | 2.547 | 2.617 |
| Published tuned | 80,000,000 | 3 | 409,853 | 2.505 | 2.553 |

[Redis follow-up logs, histograms and reproduction scripts](redis-hash-thresholds-evidence.tar.gz) · [Original 80-million-record report](benchmark-details.md)
