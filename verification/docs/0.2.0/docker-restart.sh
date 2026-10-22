set -euo pipefail
docker stop --time 60 lavik
docker start lavik
wait_for_lavik() {
  local attempt
  for attempt in {1..60}; do
    if [ "$(docker exec lavik timeout 3 redis-cli --raw PING 2>/dev/null)" = PONG ]; then
      return 0
    fi
    sleep 2
  done
  echo 'Lavik was not ready within 60 checks; inspect docker logs lavik.' >&2
  return 1
}
wait_for_lavik
docker exec lavik redis-cli GET greeting
