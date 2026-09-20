#!/usr/bin/env bash
# A private throwaway file: never point this example at an existing database.
set -euo pipefail
mkdir -p /tmp/lavik-example
fallocate -l 512M /tmp/lavik-example/data
exec lavik --bind 127.0.0.1 --port 6379 --metrics-port 0 \
  --threads 2 --no-pin-workers --registered-buffer-mb-per-worker 64 \
  --shutdown-checkpoint --data-file /tmp/lavik-example/data \
  --log-dir /tmp/lavik-example/logs
