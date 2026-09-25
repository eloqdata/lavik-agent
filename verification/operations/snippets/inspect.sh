# These are local committed reads. Select the current Meta leader first.
# Check status on each member: leader=1 identifies the leader at that moment.
for directory in "$LAVIK_ROOT"/meta-*; do
  [ -d "$directory" ] || continue
  "$LAVIK_BIN_DIR/lavik-ctl" --socket "$directory/meta-admin.sock" status
done
