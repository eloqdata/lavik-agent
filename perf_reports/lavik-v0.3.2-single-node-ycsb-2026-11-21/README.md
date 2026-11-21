Engineering · November 21, 2026

# 12.5× as many records, 61.1% higher throughput: Lavik at 1 billion vs. Redis at 80 million

Lavik sustained 621,528 operations per second over 1.024 TB of Hash field values. On the same server, Redis sustained 385,755 ops/s over 80 million records. That puts Lavik’s billion-record run at **12.5× the record count and 61.1% higher throughput** than the Redis run.

## What happens when the data outgrows RAM?

We started with 80 million records so Redis, Dragonfly and Lavik could all run on the same 128 GiB machine. Each record contained eight 128-byte fields. The values alone occupied 81.92 GB at this scale. Redis and Dragonfly held their datasets in memory. Lavik used the server’s local NVMe drives.

Then we grew only Lavik’s dataset to one billion records. We kept the server, client and 256 connections fixed. For every request, the client chose a key uniformly from the full dataset, including the newly loaded records. It read the whole Hash 95% of the time and updated all eight fields the other 5%.

**Average throughput at 256 connections**

Redis · 80M records · 385,755 ops/s

Dragonfly · 73M records · 566,630 ops/s

Lavik · 80M records · 631,666 ops/s

Lavik · 1B records · 621,528 ops/s

At 80 million records, Lavik delivered 63.7% more throughput than Redis. Growing Lavik’s dataset by a factor of 12.5 reduced its throughput by 1.6%.

## Lavik’s read and update P99.9 stayed below 3 ms

Both metrics stayed below 3 ms in each of the three measured runs at each dataset size. At one billion records, read P99.9 averaged 2.610 ms and update P99.9 averaged 2.132 ms.

| Database | Records | Ops/s | Read P99.9 | Update P99.9 |
| --- | --- | --- | --- | --- |
| Redis | 80 million | 385,755 | 2.553 ms | 2.627 ms |
| Dragonfly | 73 million | 566,630 | 2.964 ms | 3.010 ms |
| Lavik | 80 million | 631,666 | 2.565 ms | 2.063 ms |
| Lavik | 1 billion | 621,528 | 2.610 ms | 2.132 ms |

Dragonfly used its default Hash encoding thresholds in the 73-million-record run above. During a separate capacity check, Dragonfly returned an out-of-memory error at 73.56 million records. With `--listpack_max_field_len=256 --listpack_max_bytes=2048`, it held 80 million records under the same 112 GiB memory limit and served 537,054 ops/s, with read and update P99.9 of 12.655 and 13.076 ms.

## Benchmark setup

**Hardware.** Both VMs ran in Azure Central India, zone 3, with accelerated networking. The database server (L16aos\_v4) had 16 vCPUs, 128 GiB RAM and six 1.92 TB local NVMe drives in RAID 0 with a 512 KiB chunk. Lavik used a 6 TiB raw partition. The independent YCSB client (F16als\_v6) had 16 vCPUs and 32 GiB RAM. Both hosts reported AMD EPYC 9V74 processors.

**Software.** Lavik v0.3.2, Redis 8.10.3 and Dragonfly v2.1. The server ran Ubuntu 24.04.5 LTS with Linux 7.0.0-1020-azure. The client ran OpenJDK 17.0.21.1 and the EloqData YCSB fork at `247a2d448ebc`.

**Network and storage.** Across 100 ICMP packets from client to server, round-trip time averaged 0.733 ms (0.406–3.873 ms), with zero loss. Using one persistent TCP connection, 5,000 idle Redis-protocol PINGs to Lavik before the 80-million-record load had a median of 0.078 ms and P99 of 0.087 ms. A separate read-only fio check on the server after the YCSB runs delivered 270,395 random 1 KiB reads/s.

Each database ran alone. After a 30-second warmup, we measured three 60-second windows with 256 unpipelined connections. We report the mean throughput and mean of the per-window latency percentiles. All measured reads and updates succeeded.

Redis used `hash-max-listpack-value=256` so the 128-byte values qualified for compact encoding.

### Database launch parameters

Each service had CPU affinity 0–13 and a 65,535 file-descriptor limit. CPUs 14–15 handled the OS and NIC interrupts. Redis and Dragonfly ran in memory.

```
lavik --storage=uring --network=kernel \
  --bind "10.87.0.21" --port 6379 --metrics-port 9100 --threads 14 --pin-workers --max-memory 96gb \
  --shutdown-checkpoint --data-file "/dev/md/lavikbench3" --log-dir "/var/lib/lavik-bench/india-single-lavik"
```

```
redis-server --bind "10.87.0.21" --protected-mode no --save "" --appendonly no \
  --maxmemory "112gb" --maxmemory-policy noeviction \
  --hash-max-listpack-value 256 --hash-max-listpack-entries 512 --io-threads 14 --port 6379
```

```
dragonfly "--bind=10.87.0.21" --port=6379 \
  "--maxmemory=112gb" --proactor_threads=14 --snapshot_cron= --cache_mode=false
```

### YCSB workload and driver parameters

Example measured window for Lavik at 80 million records. The billion-record run used recordcount=1000000000. Redis and Dragonfly used the redis binding with the corresponding redis.host, redis.port and redis.timeout properties, plus redis.scanindex=none. All three read with HGETALL. Updates used LAVIK.HREPLACE on Lavik and HMSET on the other two engines. Loading used 64 connections and a pipeline depth of 32.

```
bin/ycsb.sh run lavik -s -P workloads/workloadb -threads 256 \
  -p recordcount=80000000 \
  -p fieldcount=8 \
  -p fieldlength=128 \
  -p readallfields=true \
  -p writeallfields=true \
  -p fieldlengthdistribution=constant \
  -p requestdistribution=uniform \
  -p readproportion=0.95 \
  -p updateproportion=0.05 \
  -p scanproportion=0 \
  -p insertproportion=0 \
  -p readmodifywriteproportion=0 \
  -p lavik.host=10.87.0.21 \
  -p lavik.port=6379 \
  -p lavik.timeout=2000 \
  -p operationcount=2000000000 \
  -p maxexecutiontime=60 \
  -p status.interval=5 \
  -p hdrhistogram.percentiles=50,95,99,99.9 \
  -p hdrhistogram.fileoutput=true \
  -p hdrhistogram.output.path=/opt/lavik-bench/results-standalone/lavik/80000000/sweep/256-confirm-1/
```

### fio and ping parameters

```
fio --readonly --name=read --filename=/dev/md/lavikbench3
    --ioengine=io_uring --direct=1 --rw=randread --bs=1k
    --iodepth=32 --numjobs=4 --offset=1G --size=8G
    --time_based=1 --ramp_time=5 --runtime=30 --group_reporting=1

ping -n -c 100 -i 0.05 -W 1 10.87.0.21
```

fio 3.36 read an 8 GiB region on the database partition while YCSB was idle. Each of four jobs used queue depth 32. The protocol PING probe discarded 200 warmup replies before timing 5,000 serial requests.

[Raw fio output](lavik-server-fio.json)
[Read the full benchmark report](benchmark-details.md)[Download logs and reproduction scripts](lavik-india-standalone-ycsb-evidence.tar.gz)
Additional Dragonfly measurements: [default-threshold capacity test](dragonfly-default-capacity.tar.gz) and [matched 40-million-record comparison](dragonfly-listpack-ab.tar.gz).
