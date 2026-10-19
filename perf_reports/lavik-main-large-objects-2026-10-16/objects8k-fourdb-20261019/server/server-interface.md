# Server control interface

Run as root from `/mnt/dev/benchmark/objects8k-fourdb-20261019`.
`product` is `lavik`, `redis`, `valkey`, or `kvrocks`; `label` is exactly
`session-<product>-<op>`. Operations are `hgetall hkeys hvals smembers lrange
zrange set setrange hash list zincr zswap stream sswap`. The caller generates
a fresh 32-character lowercase hexadecimal `owner_token` for every session.

```text
python3 server.py start <product> <label> <owner_token>
python3 server.py reset-data <product> <label> <owner_token>
python3 server.py snapshot <label-json>
python3 server.py stop-owned <product> <label> <owner_token>
```

`start` prints the active identity as JSON after PING and configuration checks.
Lavik additionally requires one complete loaded-checkpoint log line in its
immediately flushed stderr sink; `ready.json.loaded_checkpoint` records the
observed generation and entry count before FLUSHDB without imposing an old
experiment's fixed generation or cardinality.
It starts the actual binary directly with CPU affinity 0–15 and refuses an
existing session directory, active process, or listener. `active.json` records
PID, start ticks, executable/hash, arguments, affinity and owner token. Readiness
failure attempts a clean stop of only that process and records any cleanup
failure; it never retries a start.

All Lavik sessions run first on the six SPDK devices. `reset-data` is an explicit
Lavik-only FLUSHDB, permitted once per owned session and journaled before sending
the command. A repeated call is refused even if the first call's outcome is
unknown. Load starts only after its `reset-data.json` says `completed: true`.
Peer sessions start with a fresh empty per-session directory and do not use
FLUSHDB. Do not call reset-data for peers.

`snapshot` accepts a basename ending in `.json`, writes that file beneath the
server root's `snapshots/`, and prints the same JSON. It includes `active`, `proc_stat`,
`proc_status`, `info_stats`, `info_memory`, `info_commandstats`, `info_server`,
`config`, and (Lavik only) `defrag_paused` and drained transaction counters.
It also provides the existing `info` mapping and `process_stat/status/io`
names used by observation tools. The controller must match active
product/label/token against its owned session.
Snapshot filenames cannot be reused.

`stop-owned` requires the exact product/label/token and PID identity. It sends
SIGTERM, waits without SIGKILL, writes `<label>/stop.json`, and archives
`active.json`. Lavik stop additionally requires a published checkpoint and
durably-flushed shutdown log. Successful stops report checkpoint generation and
entry count without querying DBSIZE. A repeated stop of the same completed
session returns its existing receipt; a missing owned session returns
`not_started: true` only when no listener or other active identity exists.

After all 14 Lavik sessions have cleanly stopped, the root orchestrator runs
`python3 preflight_server.py` followed by `python3 raid_setup.py` exactly once.
The latter checks the six BDF/serial/namespace/capacity identities, excludes OS
and developer disks, rebinds only those controllers to `nvme`, creates RAID0
`/dev/md127`, formats ext4, and mounts it at
`/mnt/storage-peers-20261014/objects8k-fourdb-20261019`. Peer data directories
are `<mount>/<label>`. A prior setup attempt is never automatically repeated.
`raid-ready.json` is revalidated before each peer start. No RAID operation is
performed by `start`, and no script scans the keyspace.

Deployment inputs: these controller files, `main-manifest.json`,
`peer-manifest.json`, `kvrocks-template.conf`, and `spdk-devices.json` copied
from the already verified current SPDK inventory. The manifests retain their
original version/build provenance; historical experiment files are not edited.
