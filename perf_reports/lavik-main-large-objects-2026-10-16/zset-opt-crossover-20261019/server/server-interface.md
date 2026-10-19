# ZSet crossover storage and service interface

Server root is `/mnt/dev/benchmark/zset-opt-crossover-20261019`. The server scripts
reuse the verified main `684894d` and candidate `32bdd6b` binaries, both with
Bycorf `86d6867`. `main-manifest.json`, `candidate-manifest.json`, and
`spdk-devices.json` retain the prior experiment's provenance. Copy the completed
four-database RAID receipt as `previous-raid-ready.json`.

## Storage preparation

`python3 preflight_server.py raid` and `python3 restore_spdk.py` only inspect
hardware and save evidence. They verify the exact previous RAID UUID, six
controller BDF/serial/capacity/namespace identities, empty process/listener state,
all 56 previous clean stops, absence of filesystem users, and protected `/` and
`/mnt/dev` mount identities. They reject partitions, other holders, swap and
nested mounts on the selected scratch storage.

Root explicitly runs `python3 restore_spdk.py --apply` once. This unmounts only
the owned scratch filesystem, stops its RAID0 array, verifies bare namespace
identity again, removes each MD superblock, discards each whole namespace, then
writes and reads back each 4 KiB zero Lavik label. It binds only the six recorded
controllers to VFIO with an 8192 MiB hugepage request. Every subprocess has a
before/after receipt and a log under `restore-spdk/`; `spdk-ready.json` is written
only when all work and protected-mount checks succeed. A partial attempt cannot
be automatically retried. A repeat after complete preparation only verifies the
existing SPDK state. No script reboots or sends SIGKILL.

After preparation, `python3 preflight_server.py spdk` and `host_preflight.py`
verify the fresh state without clearing it.

## Service actions

- `server.py start PRODUCT LABEL OWNER_TOKEN`
- `server.py stop-owned PRODUCT LABEL OWNER_TOKEN`
- `server.py snapshot BASENAME.json`

PRODUCT is `main` or `candidate`; OWNER_TOKEN is a unique 32-hex-character token.
Labels are the exact ordered eight sessions: main compact zincr/zswap, main
grouped zincr/zswap, candidate compact zincr/zswap, candidate grouped zincr/zswap,
with format `session-PRODUCT-SIZE-OP`. There is no reset action. Each size's
8,192 keys is loaded exactly once by the client and retained across its two
commands and both binary variants; both sizes eventually total 16,384 keys.

`start` returns the active identity: product, label, owner_token, root, binary,
revision/version, binary SHA, manifest SHA, arguments, environment, 16-CPU
affinity, PID and start ticks, supervisor PID, expected recovery, previous stop
SHA and SPDK receipt SHA. The subprocess execs the actual binary directly after
setting affinity; it has no taskset intermediary. `--alsologtostderr` makes the
startup and checkpoint evidence immediately readable.

`ready.json` contains time, active identity, configuration, INFO server, and
`recovery: {mode, checkpoint, storage_devices, recovery_collection_complete}`.
`loaded_checkpoint` duplicates checkpoint as either null or `{generation,entries}`.
The first fresh start requires sanitized-media receipts, six exact storage
path/ID/capacity log records, recovery collection completion and no loaded
checkpoint. Every later start requires the exact checkpoint from the previous
clean stop. PING, one bounded EXISTS of a fixed absent readiness key, and enabled
defrag must pass before `normal_request_ready: true` is recorded. No DBSIZE,
SCAN or keyspace traversal occurs.

`stop-owned` verifies ownership and PID start ticks before SIGTERM. It waits
for the supervisor's matching zero exit receipt and the shutdown/drain/durable
flush/checkpoint logs. It returns time, requested_at, active, signal 15,
returncode 0, clean_stop_confirmed, clean_checkpoint_confirmed,
checkpoint_generation and checkpoint_entries. Stop receipt generation comes
from the log and must advance. Cleanup can honestly checkpoint a partial first
load (0–8,192 entries) or a partial first grouped load (8,192–16,384 entries),
but the next session cannot start unless its predecessor has the full expected
8,192 or 16,384 entries. Repeating a completed stop returns its matching receipt.
Other incomplete or failed starts require inspection; there is no implicit retry.

Snapshots preserve active identity, CONFIG, INFO server/memory/commandstats/stats,
raw CPU/memory/disk/network/process state, and the existing INFO aliases. They
wait for `tx_commit_queue_depth` and `storage_tx_commits_pending` to drain, record
`defrag_paused: no`, `transactions_drained: true`, and
`transaction_drain_confirmed: true`, and save exactly the JSON returned to the
client. BaseException cancellation is used so blocking subprocess waits cannot
silently swallow SIGTERM/SIGINT.
