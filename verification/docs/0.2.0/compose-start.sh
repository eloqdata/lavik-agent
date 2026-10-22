set -euo pipefail
docker compose up -d
# Allow transient not-ready (2) and unavailable (3) responses during recovery.
wait_for_cluster() {
  local attempt status
  for attempt in {1..60}; do
    if docker compose exec -T meta-1 lavik-ctl cluster-status \
      --socket /data/meta/meta-admin.sock --allow-plaintext-admin \
      --timeout-ms 3000 --json; then
      return 0
    else
      status=$?
    fi
    case "$status" in
      2|3) sleep 2 ;;
      *) return "$status" ;;
    esac
  done
  echo 'Cluster was not ready within 60 checks; inspect docker compose logs.' >&2
  return 1
}
wait_for_cluster
docker compose logs bootstrap
docker compose ps
