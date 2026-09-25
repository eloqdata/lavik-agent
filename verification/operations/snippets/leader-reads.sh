export LAVIK_LEADER_SOCKET=''
for directory in "$LAVIK_ROOT"/meta-*; do
  [ -d "$directory" ] || continue
  output=$("$LAVIK_BIN_DIR/lavik-ctl" --socket "$directory/meta-admin.sock" status) || continue
  if [[ "$output" == *"leader=1"* ]]; then
    export LAVIK_LEADER_SOCKET="$directory/meta-admin.sock"
    break
  fi
done
: "${LAVIK_LEADER_SOCKET:?No current Meta leader; inspect quorum and logs}"
"$LAVIK_BIN_DIR/lavik-ctl" --socket "$LAVIK_LEADER_SOCKET" observations group-1
"$LAVIK_BIN_DIR/lavik-ctl" --socket "$LAVIK_LEADER_SOCKET" getpolicy lavik.automatic-uncontrolled-failover-v1
"$LAVIK_BIN_DIR/lavik-ctl" --socket "$LAVIK_LEADER_SOCKET" getpolicy lavik.authority-lease-v1
"$LAVIK_BIN_DIR/lavik-ctl" --socket "$LAVIK_LEADER_SOCKET" getpolicy lavik.candidate-recovery-v1
