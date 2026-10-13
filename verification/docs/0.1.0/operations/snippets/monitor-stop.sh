# Keep named volumes, dashboards and metric history.
docker compose --env-file .env -f compose.yaml -f compose.local.yaml down
