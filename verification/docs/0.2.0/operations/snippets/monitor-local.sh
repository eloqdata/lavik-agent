# Linux Docker Engine, Compose v2.24.4+.
# Share the Linux host network to scrape this guide's loopback-only Lavik nodes.
cat > compose.local.yaml <<'YAML'
services:
  prometheus:
    network_mode: host
    ports: !reset []
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.path=/prometheus
      - --storage.tsdb.retention.time=30d
      - --web.listen-address=127.0.0.1:9090
  grafana:
    network_mode: host
    ports: !reset []
    environment:
      GF_SERVER_HTTP_ADDR: 127.0.0.1
    extra_hosts:
      - prometheus:127.0.0.1
YAML
# --quiet validates without printing the Grafana password.
docker compose --env-file .env -f compose.yaml -f compose.local.yaml config --quiet
docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d
docker compose --env-file .env -f compose.yaml -f compose.local.yaml ps
