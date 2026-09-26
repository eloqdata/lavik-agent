docker compose exec meta-1 lavik-ctl failover group-1 \
  --socket /data/meta/meta-admin.sock --allow-plaintext-admin \
  --failover-timeout-ms 60000
docker compose exec meta-1 lavik-ctl cluster-status \
  --socket /data/meta/meta-admin.sock --allow-plaintext-admin --json
docker compose exec primary redis-cli -c GET hello
