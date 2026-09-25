# Run inside lavik-monitoring-beta1. Keep this file private.
# Do not overwrite an existing monitoring installation's credentials.
test ! -e .env || { echo ".env already exists; edit it instead." >&2; exit 1; }
umask 077
password=$(openssl rand -hex 24)
printf '%s\n' \
  'LAVIK_TARGETS=127.0.0.1:9101' \
  'GRAFANA_ADMIN_USER=admin' \
  "GRAFANA_ADMIN_PASSWORD=$password" \
  'GRAFANA_BIND_ADDRESS=127.0.0.1' \
  'PROMETHEUS_BIND_ADDRESS=127.0.0.1' > .env
unset password
