# lavik-ctl operator guides

The two bilingual guides cover the shipped `v0.1.0-beta.1` binaries. The CLI is
an administrative client, not a version installer or process supervisor. Single
node means one Meta voter and one Meta-managed Data process. The HA lab uses
three Meta voters and one primary–follower Group on one Linux host; separate
failure domains require a separate deployment.

The renderer reads commands directly from `verification/operations/snippets`.
The Docker harness executes those same files with a pinned, checksum-verified
package. Both native Minimal and Standard variants use kernel TCP/io_uring.
No SPDK device, host disk, API credential, repository env file, or host port is
passed to the containers. State lives on a disposable tmpfs; resource limits and
read-only roots bound the test. Docker needs io_uring-capable Linux and sufficient
memory (the runtime container limit is 4 GiB, with additional monitoring services).

Run:

```sh
python3 scripts/verify-operations.py
```

The matrix checks version output, initial manifests, process startup, destructive
creation only on fresh files, readiness, client replies, follower synchronization,
Meta leader reads, policies, metrics, completed controlled failover, a graceful
full restart, and automatic promotion after a primary-process SIGKILL. The crash
probe verifies one already-replicated key; it is not proof of lossless failover.
It does not certify crashed-node rejoin or regained redundancy after that crash.
The ordinary stop/restart check precedes this failure injection.

Monitoring downloads the exact upstream directory and compares every recorded
file with its source snapshot. The displayed Linux host-network Compose override
is validated as written. For the runtime test only, a further override substitutes
the disposable Lavik container's network namespace for the Linux host network.
Grafana, Prometheus and Lavik then share isolated loopback without opening host
ports. Check both Prometheus targets, an `up` query, Grafana database health, the
provisioned datasource and dashboard, and target-config recreation. Only the
verification project's newly created volumes are deleted during test cleanup;
the user-facing stop command keeps volumes. The temporary Grafana test password
is neither printed nor included in published evidence.

`evidence/operations/0.1.0/verification.json` contains actual results and input
hashes. Source snapshots retain their upstream notices and are pinned to the
same beta source commit. The manual publication gate rejects missing, stale or
failed execution evidence and requires a local ChatGPT-subscription review of
all new content, sources, renderer, tests and gates. Unchanged command/client
pages retain their existing evidence. Hosted Admin and Azure remain disabled.

The guide explicitly separates this co-located Linux test from multi-host,
network partition, TLS, SPDK, power-loss and production-SLA validation. Preserve
Meta/Data state when recovery remains blocked; never recreate an existing
cluster to make a readiness check green.

Review hardening checks also run the follower restart block without Bash errexit
against rejected status exits, an unavailable owner, changed Group term, active
transition, stale observations and malformed JSON. Each must stop before PID
lookup. Monitoring extraction inherits umask 077 while nonsecret bind-mounted
configuration remains readable to the container users and credentials stay 0600.
Target-refresh evidence records completed generators and observed discovery
changes from two targets to one and back to two healthy targets.
