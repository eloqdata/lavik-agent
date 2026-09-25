# Reuse these paths after a restart; do not initialize the directory again.
: "${LAVIK_BIN_DIR:?Set the absolute package directory}"
: "${LAVIK_ROOT:?Set the existing state directory}"
test -f "$LAVIK_ROOT/cluster.toml"
for pidfile in "$LAVIK_ROOT"/*.pid; do
  [ -f "$pidfile" ] || continue
  if kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "A recorded process is still running: $pidfile" >&2
    exit 1
  fi
done
for i in 1 2 3; do
  bootstrap=()
  if [ ! -f "$LAVIK_ROOT/meta-$i/cluster_config.dat" ]; then
    bootstrap=(--initial-cluster-manifest "$LAVIK_ROOT/cluster.toml")
  fi
  nohup "$LAVIK_BIN_DIR/lavik-meta" --id "$i" \
    --addr "127.0.0.1:$((7100+i))" \
    --ctl-addr "127.0.0.1:$((7200+i))" \
    --data-control-addr "127.0.0.1:$((7300+i))" \
    --data-dir "$LAVIK_ROOT/meta-$i" "${bootstrap[@]}" \
    > "$LAVIK_ROOT/meta-$i.log" 2>&1 < /dev/null &
  echo "$!" > "$LAVIK_ROOT/meta-$i.pid"
done
# Wait for a leader before submitting the creation request.
deadline=$((SECONDS+30))
leader=0
while (( SECONDS < deadline )); do
  for directory in "$LAVIK_ROOT"/meta-*; do
    [ -d "$directory" ] || continue
    output=$("$LAVIK_BIN_DIR/lavik-ctl" --socket "$directory/meta-admin.sock" status 2>/dev/null) || continue
    if [[ "$output" == *"leader=1"* ]]; then leader=1; break; fi
  done
  (( leader == 1 )) && break
  sleep 1
done
(( leader == 1 )) || { echo "No Meta leader: inspect $LAVIK_ROOT/meta-*.log" >&2; exit 1; }

for i in 1 2; do
  node_id=$(printf '%040d' 0 | tr '0' "$i")
  nohup "$LAVIK_BIN_DIR/lavik" --bind 127.0.0.1 \
    --port "$((6370+i))" --metrics-port "$((9100+i))" \
    --network kernel --storage uring --threads 1 --no-pin-workers \
    --registered-buffer-mb-per-worker 64 --max-memory 512MiB \
    --shutdown-checkpoint --cluster-enabled --cluster-node-id "$node_id" \
    --cluster-announce-ip 127.0.0.1 \
    --cluster-meta-seed 127.0.0.1:7301 \
    --cluster-meta-seed 127.0.0.1:7302 \
    --cluster-meta-seed 127.0.0.1:7303 \
    --data-file "$LAVIK_ROOT/data-$i/lavik.data" \
    --log-dir "$LAVIK_ROOT/data-$i/logs" \
    > "$LAVIK_ROOT/data-$i.log" 2>&1 < /dev/null &
  echo "$!" > "$LAVIK_ROOT/data-$i.pid"
done
