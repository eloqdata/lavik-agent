docker compose exec meta-1 lavik-ctl cluster-status \
  --socket /data/meta/meta-admin.sock --allow-plaintext-admin --json
docker compose exec primary redis-cli -c SET hello lavik
docker compose exec primary redis-cli -c GET hello

# Read on one connection after replication catches up.
printf 'READONLY\nGET hello\n' | docker compose exec -T follower redis-cli --raw
