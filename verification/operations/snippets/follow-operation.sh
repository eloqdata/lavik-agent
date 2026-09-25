# First export LAVIK_OPERATION_ID to the actual ID printed by the CLI.
# Refresh LAVIK_LEADER_SOCKET using the leader-discovery block above.
: "${LAVIK_OPERATION_ID:?Set the operation ID printed by cluster-create or failover}"
: "${LAVIK_LEADER_SOCKET:?Discover the current Meta leader first}"
"$LAVIK_BIN_DIR/lavik-ctl" --socket "$LAVIK_LEADER_SOCKET" getop "$LAVIK_OPERATION_ID"
