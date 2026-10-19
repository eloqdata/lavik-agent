# Raw performance results

Original benchmark outputs are organized by the matching report directory in [eloqdata/lavik](https://github.com/eloqdata/lavik/tree/471f4864357f4a5034c64e7d4972ec0e55b82d94/perf_reports).

| Report | Scope |
|---|---|
| [2 vCPU Redis/Valkey comparison](lavik-v0.1.0-2vcpu-latest-capacity-2026-10-13) | 1 million keys for the memory comparison and 100 million keys for Lavik capacity measurements, with 1 KiB values. |
| [16 vCPU Redis/Valkey comparison](lavik-v0.1.0-spdk-vs-latest-2026-10-13) | 10 million keys for the memory comparison and 1 billion keys for Lavik storage measurements, with 1 KiB values. |
| [1TB storage-system comparison](lavik-v0.1.0-storage-peers-1tb-2026-10-14) | Dragonfly, Garnet, Apache Kvrocks, Pika and Tendis: 1 billion keys with 1 KiB values. The Lavik measurements are shared with the 16 vCPU report. |
| [Aerospike YCSB comparison](lavik-v0.1.0-aerospike-ycsb-2026-10-13) | Lavik and Aerospike: 100 million records with 10 × 128 B fields; workloads A/B/C/D at a 100K target and unlimited rate. |
| [Large-object comparison](lavik-v0.1.0-large-objects-2026-10-14) | 8,192 keys × approximately 1 MiB payload; Lavik, Redis, Valkey and Kvrocks; seven workloads, five connection counts and three rounds. |
| [Main large-object reads and writes](lavik-main-large-objects-2026-10-16) | 1 MiB results retain main `9c68079`, six full-read commands at 80 and 1 connections, and eight write workloads at 80 connections. The 8 KiB supplement compares main `684894d`, Redis, Valkey and Kvrocks across all 14 read/write workloads at 80 connections; 8,192 keys in both groups. |

Follow-up main measurements are archived separately from release measurements. Each directory includes a source reference, raw output, metadata and SHA-256 checksums.
