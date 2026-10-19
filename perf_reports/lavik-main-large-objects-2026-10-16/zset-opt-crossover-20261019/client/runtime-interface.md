# ZSet optimization crossover

This is a fresh experiment at `/mnt/dev/benchmark/zset-opt-crossover-20261019`
on the server and `/opt/benchmark/zset-opt-crossover-20261019` on the client.
Only the operator performs the explicit six-test-device SPDK transition. The
controller never resets data, provisions storage, retries a failed point, or
assumes an old experiment's checkpoint generation.

The fixed sequence is main compact ZINCRBY / ZREM-ZADD, main grouped ZINCRBY /
ZREM-ZADD, candidate compact ZINCRBY / ZREM-ZADD, and candidate grouped ZINCRBY /
ZREM-ZADD. Main is `684894d973878ca0e0649b54404ce77521f1695f`; candidate is
`32bdd6b474733c2850b80e3cc217461075e73af5`. Both binaries use Bycorf
`86d686724ddd1c5617fb1b62f8131e05571e8423`, with their original build/test manifests.

Each size has 8,192 keys in its own prefix, returned by `clients.interface.prefix`:
`zset-opt:compact` has 256 members per key and `zset-opt:grouped` has 32,768.
Each member is 32 bytes. Each size is loaded exactly once, at its first main
ZINCRBY point; the grouped load adds its namespace without replacing compact.
The same data continues through the remaining commands and candidate runs.
This is a fixed-order, single-run crossover, not independent fresh datasets
for main and candidate.

All phases use the same client binary and 80 connections, 16 client threads,
pipeline 1. Load seed is 101, warmup seed 10180 for 90 seconds, and formal seed 20180
for 60 seconds. Formal process/NIC monitoring runs 45 seconds without profiling.
ZINCRBY selects an existing member using the current alternative-member state
and increments by ±32768. Each ZREM/ZADD operation completes both commands and
uses a connection-owned member slot. Throughput and latency for this operation
are pairs/s and full-pair latency; individual command metrics remain available.

Each size has one 1280×8192-byte flag matrix, initialized once to zero. Only the
first 80 connection slots may change. ZINCRBY and load must preserve every byte;
ZREM/ZADD saves its completed-pair state atomically. The controller and analyzer
check state before/after each phase and continuity between points and versions.
Three known keys 0,4096,8191 are checked using bounded full ZRANGE WITHSCORES plus
ZCARD before warmup, after warmup, and after formal measurement. No DBSIZE,
SCAN, or database enumeration is used.

Every point runs in a fresh owned service process, stops cleanly, and records
the shutdown checkpoint. The first start must attest fresh storage with no
checkpoint; each later start must recover exactly the previous stop's checkpoint.
The first two stops contain 8,192 keys, later complete stops 16,384. Each complete
checkpoint generation advances once; the initial generation is not hardcoded.
All commandstats deltas match checked successful replies. Compact points must
have zero grouped commit transactions, with drained endpoints; grouped writes
must have positive transaction counts.

Run `sudo python3 suite.py` in the exact client root after finalizing/deploying
runtime and verifying the explicit storage preparation. A dedicated BaseException
subclass handles cancellation; the controller lets the client finish its current
command/pair, records its exit, and invokes ownership-checked clean stop in a
finally block. No SIGKILL or automatic partial retry is used. An interruption is
a failed measurement. Creating `pause-after-case` allows the current complete
point to finish and checkpoint before a clean pause. After removing that marker,
`sudo python3 suite.py --resume` accepts only a verified completed prefix.

`collect.py` collects this experiment only, preserving previous local collections.
`analyze.py --partial` validates a completed prefix; full analysis requires all
eight points and both namespace state chains. Runtime/source manifests, actual
commands, raw results, snapshots, observations, samples, and clean-stop receipts
are retained. Any later publication is a separate explicit action.
