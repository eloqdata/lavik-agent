# Four-database 8 KiB runtime

This directory is a new experiment. Server root is
`/mnt/dev/benchmark/objects8k-fourdb-20261019`; client root is
`/opt/benchmark/objects8k-fourdb-20261019`. Local tooling does not start a workload
until the root orchestrator explicitly deploys and launches a phase.

The 56 formal points are four databases × 14 operations, in this order:
HGETALL, HKEYS, HVALS, SMEMBERS, LRANGE, ZRANGE WITHSCORES, SET, SETRANGE,
HSET, LPUSH/RPOP, ZINCRBY, ZREM/ZADD, XADD MAXLEN, SADD/SREM.
Each point has its own freshly started service and fresh 8,192-key dataset.
String values are 8,192 bytes; Hash/List have 32 × 256-byte values;
Set/ZSet have 256 × 32-byte members; Stream has 32 × 256-byte payload entries.
The same five client binaries and source hashes apply to all four databases.

All formal points use 80 connections, 16 client threads, pipeline 1, 90 seconds
of warmup and 60 seconds of formal measurement. Seeds are load101,
warm10180 and formal20180. Each formal point includes a 45-second process,
CPU, NIC and TCP observation starting approximately three seconds after its
client starts. No profiling runs alongside the comparison.

## Manual phases

1. Build/test the five clients and finalize their shared manifest. Root runs
   `finalize.py`, `deploy_runtime.py`, and host preflight for the Lavik phase.
2. Launch `suite.py lavik` as root in its own client unit. It runs 14 points,
   then exits; it never reconfigures storage or starts peer points automatically.
3. Root verifies 14 completed points and all clean checkpoints, then explicitly
   invokes the separately owned server preflight/RAID setup. That step replaces
   the six dedicated test-device contents with RAID0/ext4. It is not a runner action.
4. Root checks `raid-ready.json` and launches a separate `suite.py peers` unit.
   It runs Redis's 14 points, then Valkey's 14, then Kvrocks's 14.

For each point the runner creates a fresh token and exact label
`session-<product>-<op>`, calls server `start`, verifies the active identity,
and (Lavik only) explicitly calls `reset-data` exactly once. Peers start with
new empty directories and are never FLUSHDB'd. The runner then loads all keys,
validates three known keys, warms, validates again, measures, validates again,
and invokes `stop-owned` in a `finally` block. Lavik must publish a clean
checkpoint containing 8,192 entries. Peer stop must be confirmed clean.
The server interface is documented in `server-interface.md`.

## Correctness and cancellation

Load acknowledgement counts are exact. Every timed reply is checked by the
appropriate client; full-read clients validate the entire response. Three-key
sample checks read only keys0,4096,8191, with bounded complete 8 KiB objects.
No DBSIZE, SCAN, keyspace iteration or full-database cardinality check is used.
Commandstats deltas before/after every load, warm and formal phase must equal
the successfully checked client command counts. Paired throughput/latency is
for the whole pair; individual commands remain in raw JSON.

ZREM/ZADD and SADD/SREM each use a new zeroed 1280×8192 state file. Only slots0–79
are active. The same state continues from warmup into formal measurement;
before/after copies, SHA and parity checks are retained. Every independent
operation and database starts from its own fresh state and data.

SIGTERM/SIGINT raise a custom BaseException, rather than InterruptedError,
so Python subprocess waits cannot silently consume the interruption. Client
cleanup lets an in-flight pair finish and retains partial evidence; such a
phase is marked failed and cannot automatically restart. Only an exactly owned
server can be stopped, including when a successful start loses its SSH reply.
No SIGKILL, automatic data reset retry, or automatic partial-case retry exists.

Create client-root `pause-after-case` to request a clean pause. The runner
finishes the current complete point and clean stop, writes `<phase>-paused.json`,
and returns a distinct pause result; suite exits successfully and does not mark
failure. Remove the marker explicitly and launch `suite.py <phase> --resume`
to continue a clean paused prefix. Completed points are validated and skipped;
partial or failed points refuse resume. The storage phase remains unchanged.

## Evidence

`families/<product>-<op>.json` records ownership and the complete load/warm/formal
results plus clean stop. Each `results/<product>-<op>-load|warm|c80/` contains
exact commands, result, client/server snapshots, timing and counter reconciliation.
Formal observations live on both hosts under `observations/<product>-<op>-c80/`.
The server also keeps launch/config/log/checkpoint receipts per session.
`collect.py` gathers only this experiment's source, text evidence and state
files, preserving any previous local collection. Binaries, source build trees,
database files and private keys are excluded. Publication remains a separate task.
