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
