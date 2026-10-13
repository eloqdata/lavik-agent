# Edit LAVIK_TARGETS in this monitoring directory's .env first.
docker compose --env-file .env -f compose.yaml -f compose.local.yaml \
  up --force-recreate --exit-code-from target-config target-config
# After exit 0, allow up to 30 seconds for discovery, then check Prometheus Targets.
