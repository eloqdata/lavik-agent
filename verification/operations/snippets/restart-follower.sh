# Only for node 2 in the initial two-Data lab, before any failover.
# Preserve its data file, node ID and Meta state. Requires python3.
(
if ! status=$("$LAVIK_BIN_DIR/lavik-ctl" cluster-status \
  --socket "$LAVIK_ROOT/meta-1/meta-admin.sock" --allow-plaintext-admin --json); then
  echo "Cluster status is not ready; stop and inspect." >&2
  exit 1
fi
printf '%s' "$status" | python3 -c '
import json,sys
s=json.load(sys.stdin)
assert s["result"] == "ready" and s["cluster_state"] == "created"
assert all(s[k] is True for k in ("meta_available", "meta_membership_stable", "topology_converged", "serving_ready", "cluster_ready"))
assert s["blockers"] == [] and len(s["groups"]) == 1
g = s["groups"][0]
assert g["group_id"] == "group-1" and g["term"] == "1"
assert g["owner_node_id"] == "1"*40 and g["serving_ready"] is True
assert g["topology_converged"] is True and g["automatic_failover_state"] == "healthy"
assert g["current_reason"] is None and g["blocked_reason"] is None
assert len(s["data_nodes"]) == 2
for node_id, role in (("1"*40, "primary"), ("2"*40, "replica")):
    n = next(n for n in s["data_nodes"] if n["node_id"] == node_id)
    assert n["role"] == role and n["group_id"] == "group-1" and n["retired"] is False
    assert all(n[k] is True for k in ("current_session", "projection_current", "health_fresh", "population_current"))
' || { echo "Initial serving roles, term or transition checks failed; stop and inspect." >&2; exit 1; }
pid=$(cat "$LAVIK_ROOT/data-2.pid")
test "$(readlink "/proc/$pid/exe")" = "$LAVIK_BIN_DIR/lavik" || exit 1
tr '\0' '\n' < "/proc/$pid/cmdline" | grep -F -- "$LAVIK_ROOT/data-2/lavik.data" > /dev/null || exit 1
kill -TERM "$pid"
deadline=$((SECONDS+60))
while [ "$(readlink "/proc/$pid/exe" 2>/dev/null)" = "$LAVIK_BIN_DIR/lavik" ]; do
  (( SECONDS < deadline )) || { echo "Follower did not stop; inspect logs." >&2; exit 1; }
  sleep 1
done
nohup "$LAVIK_BIN_DIR/lavik" --bind 127.0.0.1 --port 6372 --metrics-port 9102 \
  --network kernel --storage uring --threads 1 --no-pin-workers \
  --registered-buffer-mb-per-worker 64 --max-memory 512MiB --shutdown-checkpoint \
  --cluster-enabled --cluster-node-id 2222222222222222222222222222222222222222 \
  --cluster-announce-ip 127.0.0.1 \
  --cluster-meta-seed 127.0.0.1:7301 --cluster-meta-seed 127.0.0.1:7302 \
  --cluster-meta-seed 127.0.0.1:7303 \
  --data-file "$LAVIK_ROOT/data-2/lavik.data" --log-dir "$LAVIK_ROOT/data-2/logs" \
  >> "$LAVIK_ROOT/data-2.log" 2>&1 < /dev/null &
echo "$!" > "$LAVIK_ROOT/data-2.pid"
)
