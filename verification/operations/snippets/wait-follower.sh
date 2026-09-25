# Initial creation only: node 2 is the follower. After failover, discover roles again.
deadline=$((SECONDS+120))
synced=0
while (( SECONDS < deadline )); do
  if ! info=$(redis-cli -h 127.0.0.1 -p 6372 --raw INFO replication 2>/dev/null); then
    sleep 1
    continue
  fi
  if [[ "$info" == *"lavik_replication_failed_stopped:1"* ]]; then
    printf '%s\n' "$info" >&2
    echo "Follower replication stopped; inspect logs before a state-preserving follower restart." >&2
    break
  fi
  if [[ "$info" == *"master_link_status:up"* && "$info" == *"master_sync_in_progress:0"* ]]; then
    synced=1
    printf '%s\n' "$info"
    break
  fi
  sleep 1
done
if (( synced != 1 )); then
  printf '%s\n' "$info" >&2
  echo "Follower is not synchronized; inspect its log and Meta observations." >&2
fi
# Return a failed check without explicitly exiting a reader's interactive shell.
(( synced == 1 ))
