# 8 KiB clients

All five clients use Linux epoll, one outstanding command per connection, 80 connections, 16 pinned threads, 8,192 keys, and one measured run per workload. Each workload has a fresh namespace and freshly loaded data. Warmup lasts 90 seconds; the formal window lasts 60 seconds. `clients/interface.py` provides command construction, load counts, state creation, and result validation.

| Binary | Workload IDs | Shape and commands |
| --- | --- | --- |
| bench | set, setrange, hash, list, zincr, zswap, stream | String 8192 B; Hash/List 32 × 256 B; ZSet 256 × 32 B; Stream 32 × 256 B |
| bench_sswap | sswap | Set 256 × 32 B; SADD then SREM |
| bench_hash | hgetall, hkeys, hvals | Hash 32 × 256 B; deterministic field/key-tagged read dataset |
| bench_lrange | lrange | List 32 × 256 B, LRANGE 0 -1 |
| bench_workdist | smembers, zrange | 256 × 32 B; ZRANGE 0 -1 WITHSCORES |

Required flags: `--op`, `--phase`, `--host`, `--port`, `--prefix`, `--connections`, `--threads`, `--keys`, `--seconds`, `--seed`, `--out`. Read clients accept `--load-seed` (default 101); helpers pass it consistently. Phases are `load`, `warm`, `run`; read clients additionally support `validate`, which uses one connection, one thread, and exactly keys 0, 4096 and 8191. HKEYS/HVALS load with `--op hgetall`. Write validation is a separate controller-owned bounded three-key RESP check, not another timed workload.

Default arguments are restricted to this experiment. The only override is explicit `--test-mode 1`, restricted to 127.0.0.1, at most 8 keys and 4 connections/threads, and at most 2 seconds; this is for fake-server fixtures and is recorded in output.

SETRANGE replaces 256 B at offsets 0…7936 inclusive. ZINCRBY chooses one of 256 members and adds ±32768; ZREM/ZADD chooses its connection-owned slot and uses score `sequence % 32768`. LPUSH/RPOP and both Set/ZSet pairs count one completed pair as one OPERATIONS sample and separately report each command. XADD uses exact `MAXLEN = 32`.

For zswap/sswap, `--state` is mandatory during warm/run. `initialize_state` exclusively creates a fresh all-zero file: little-endian int32 capacity 1280 and key count 8192, followed by 1280 × 8192 one-byte flags. Only rows 0…79 can be active. Never reinitialize between warm and formal; the state file is atomically replaced after a successful or gracefully interrupted phase. Wrong dimensions, trailing bytes, flags outside 0/1, and nonzero inactive rows are rejected.

SIGTERM/SIGINT requests a graceful stop: an outstanding operation finishes, including the second command of any pair, before the connection closes and flags are saved. Output records `interrupted: true`, exits 130, and must not be accepted as a completed formal point. Socket/protocol errors exit 1 and do not claim recoverable pair state.

JSON retains the previous `metrics` fields (`count`, `qps`, `avg_ms`, `p50_ms`, `p99_ms`, `p999_ms`, `max_ms`) with rounded-microsecond samples and nearest-rank percentiles. `OPERATIONS` is pair throughput for list/zswap/sswap. Additional fields explicitly identify shape, seed, client threads, prefix, pipeline 1, test mode, and interruption. Load counts are command counts: 8192 for String/Hash/List; 16384 for Set/ZSet; 262144 for Stream. Raw values are printed to six decimal places.
