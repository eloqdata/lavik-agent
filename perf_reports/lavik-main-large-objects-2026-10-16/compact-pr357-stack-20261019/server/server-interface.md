# Compact PR357 stack server interface

Server root: `/mnt/dev/benchmark/compact-pr357-stack-20261019`.
Only `lavik` is accepted. `stack-manifest.json` pins the actual stacked source,
binary, build/source manifests and Bycorf dependency. No disk reprovisioning is
performed by this controller.

The fixed family order is `hgetall`, `hkeys`, `hvals`, `smembers`, `lrange`,
`zrange`, `set`, `setrange`, `hash`, `list`, `zincr`, `zswap`, `stream`, `sswap`.
Each label is `session-lavik-<op>` and each attempt has a fresh 32-hex owner token.

- `start lavik <label> <owner>` validates host, exact binary and six VFIO devices;
  it restores the previous checkpoint before returning the owned active JSON.
  The first checkpoint is authenticated by `initial-recovery.json` and the exact
  `origin-stop.json`: crossover generation 8, 16,384 entries. Subsequent starts
  restore the previous successful family, with 8,192 entries. There is no fallback
  to fresh media or an older checkpoint.
- `reset-data lavik <label> <owner>` requires the matching ready receipt and issues
  one explicit `FLUSHDB`. It writes the attempt before sending the command, rejects
  repeat calls, requires `OK` and rechecks ownership. Each family then loads its
  own 8,192 keys. No count scan or keyspace traversal is used.
- `snapshot <basename.json>` requires a live identity, defrag enabled and drained
  transactions. It writes `snapshots/<basename.json>` and returns the same JSON.
- `stop-owned lavik <label> <owner>` validates PID, start ticks and executable,
  sends SIGTERM, waits for the supervised exit, and requires durable flush plus
  one checkpoint whose generation is exactly one above the recovered checkpoint.
  It never sends SIGKILL. A partial failed load can be stopped cleanly; advancing
  the sequence additionally requires a completed reset and exactly 8,192 entries.

`active` contains `root`, `product`, `label`, `owner_token`, `revision`, `version`,
`binary`, `binary_sha256`, `pid`, `start_ticks`, `args`, `cpu_affinity`,
`expected_recovery`, `previous_stop_sha256` and `spdk_ready_sha256`.

`ready.json` contains the active identity, configuration, `loaded_checkpoint`,
`normal_request_ready: true`, and `recovery` with the exact checkpoint, all six
storage paths/capacities, and `recovery_collection_complete: true`.

A completed reset receipt contains `active`, `command: ["FLUSHDB"]`, `completed:
true`, `response: "OK"` and timing. The stop receipt contains `active`, signal 15,
return code 0, `clean_stop_confirmed`, `clean_checkpoint_confirmed`,
`checkpoint_generation`, `checkpoint_entries` and timing. Successful families
produce generations 9 through 22, each with 8,192 entries.

Snapshots preserve the earlier four-database schema: `info` sections and their
flat aliases, process stat/status/IO, host counters, `defrag_paused: "no"`, and
both transaction-drained flags. Start/stop/reset are serialized by global and
experiment locks. There is no automatic retry, disk reset, RAID or peer action.
