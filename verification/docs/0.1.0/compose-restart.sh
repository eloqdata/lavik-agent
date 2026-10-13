docker compose stop --timeout 60
docker compose up -d
docker compose exec -T meta-1 lavik-ctl cluster-status   --socket /data/meta/meta-admin.sock --allow-plaintext-admin --json
