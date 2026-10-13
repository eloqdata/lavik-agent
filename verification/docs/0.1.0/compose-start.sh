docker compose pull
docker compose up -d
docker compose logs bootstrap
docker compose ps
docker compose exec -T meta-1 lavik-ctl cluster-status   --socket /data/meta/meta-admin.sock --allow-plaintext-admin --json
