# ZSet crossover client

One `clients/bench` binary is shared by main and candidate. Two size-specific datasets are loaded exactly once: `zset-opt:compact` has 256 × 32 B members per key; `zset-opt:grouped` has 32768 × 32 B members per key. Each has 8192 keys and its own flags file. No per-operation or per-version reload.

Use `interface.command(size, op, phase, output, state)`; size is `compact` or `grouped`, op is `zincr` or `zswap`, phase is `load`, `warm`, or `run`. The load phase accepts only `zincr` and requires a pre-existing all-zero state. Formal dimensions are fixed to 80 connections, 16 client threads, pipeline 1, warm 90 seconds, formal 60 seconds; seeds are load 101, warm 10180, formal 20180. Load `--seconds=1` is metadata only: completion requires all acknowledged batches. `expected_load_count(size)` gives 16384 or 2097152 ZADD commands, each containing 128 members. A controller-owned three-key sample validates shape/member state between phases.

The state format remains two little-endian int32 values (capacity 1280, keys 8192), followed by 1280 × 8192 byte flags. `initialize_state(path)` creates it with exclusive `xb`, once per size. Only slots 0…79 may have nonzero flags. ZINCRBY reads those flags to select the currently present a/b member; all larger slots use a. ZINCRBY never changes the flags file. ZREM/ZADD completes a removal/addition pair before toggling its connection-owned slot and atomically saving flags. Both versions use the same file, including candidate ZINCRBY after main ZREM/ZADD.

SIGTERM/SIGINT finish the outstanding command or full pair before closing. The result records `interrupted: true` and the process exits 130; the controller must treat that phase as interrupted and must not advance automatically. Protocol/socket failure exits 1 and does not claim recoverable pair state. Use the controller's BaseException signal handler so subprocess waits cannot swallow a stop request.

Results keep `metrics.OPERATIONS` plus `ZINCRBY` or `ZREM`/`ZADD`. ZREM/ZADD OPERATIONS is pairs/s and pair latency. Metadata includes members, data_shape, prefix, threads, seed, pipeline, test_mode and interrupted. The only smaller-case override is explicit loopback `--test-mode 1` for fake RESP tests.

Root can compile and test on the client with `python3 clients/build_client.py --root /opt/benchmark/zset-opt-crossover-20261019`. It writes the authoritative top-level client build manifest and Linux test receipt; no database access is used by these fake tests.
