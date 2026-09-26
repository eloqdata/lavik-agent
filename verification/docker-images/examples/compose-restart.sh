docker compose down --timeout 60
docker compose up -d
docker compose logs -f bootstrap
# After bootstrap exits successfully, check readiness and the current owner.
docker compose exec meta-1 lavik-ctl cluster-status \
  --socket /data/meta/meta-admin.sock --allow-plaintext-admin --json
docker compose exec primary redis-cli -c GET hello
