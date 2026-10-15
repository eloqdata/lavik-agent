# Large-object benchmark: raw results

Lavik 0.1.0, Redis 8.10.2, Valkey 9.1.2 and Apache Kvrocks 2.17.0, tested with **8,192 keys and approximately 1 MiB of payload per key** (8 GiB per workload, excluding metadata). Server: Azure Standard_L16aos_v4; client: Standard_F32als_v6.

The completed experiment contains **420 formal points**: four systems × seven workloads × five connection counts × three rounds. Connections: 80, 160, 320, 640 and 1280; client threads: 16; pipeline: 1. Each measurement lasts 60 seconds after a 30-second warmup, with up to three additional warmups when the first and last ten-second rates differ by at least 25%. Each round starts with a fresh dataset. Lavik defrag is enabled. Redis and Valkey periodic RDB snapshots and AOF are disabled.

| Workload directory | Operation | Object layout |
|---|---|---|
| `set` | SET entire value | 1 MiB string |
| `setrange` | SETRANGE random 256-byte range | 1 MiB string |
| `hash` | HSET an existing random field | 4,096 fields × 256 B |
| `list` | LPUSH followed by RPOP | 4,096 elements × 256 B |
| `zincr` | ZINCRBY an existing random member | 32,768 members × 32 B, plus scores |
| `zswap` | ZREM followed by ZADD | 32,768 members × 32 B; each connection replaces its own member slot |
| `stream` | XADD with exact MAXLEN 4096 | 4,096 entries × 256 B payload |

## Results and source files

- Raw results: [Lavik](raw/lavik), [Redis](raw/redis), [Valkey](raw/valkey), [Kvrocks](raw/kvrocks).
- [Summary](metadata/summary.json): median QPS and latency across three rounds, plus minimum and maximum QPS.
- [All 420 formal points](metadata/formal-points.json): flattened operation-level metrics for each individual run.
- [Experiment settings](metadata/EXPERIMENT.json) and [client build identity](metadata/CLIENT_BUILD.json).
- [Client source and runners](scripts/client), [server control and provisioning scripts](scripts/server).
- [Server launch commands, logs and before/after snapshots](server); [smoke tests](smoke).
- [Source archive checksums and scope](SOURCE.json); [file checksums](SHA256SUMS).

For example, `raw/lavik/hash/r1/c80.json` contains the first-round HSET measurement at 80 connections. Its `.command.json` sibling records the exact client invocation. `load*` and `warm*` files are separate from formal measurements. Validation files sample object lengths/cardinalities and payloads; they do not scan every key.

`metrics.OPERATIONS` reports completed operations per second and end-to-end latency in milliseconds. For LPUSH/RPOP and ZREM/ZADD, one operation is a complete sequential pair; each command also has its own latency metrics. Do not count a pair as two operations when comparing the operation-level results. The client validates responses and records errors. All 420 uploaded formal points completed with zero errors.

The archived source is the exact client used for these measurements. All four systems use the same executable; 256-byte payloads are independently generated with deterministic pseudorandom bytes. Original commands and configuration files are retained verbatim as execution records.

Verify files from this directory with `shasum -a 256 -c SHA256SUMS`.
