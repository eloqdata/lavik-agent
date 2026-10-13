#!/usr/bin/env bash
# A private throwaway file: never point this example at an existing database.
set -euo pipefail
if [ ! -x ./lavik ]; then
  echo "Run this from the extracted Lavik package directory (the folder containing ./lavik)." >&2
  exit 1
fi
mkdir -p /tmp/lavik-example
if [ ! -e /tmp/lavik-example/data ]; then
  fallocate -l 512M /tmp/lavik-example/data
fi
./lavik --bind 127.0.0.1 --port 6379 --metrics-port 0 \
  --network kernel --storage uring \
  --threads 2 --no-pin-workers --registered-buffer-mb-per-worker 64 \
  --shutdown-checkpoint --data-file /tmp/lavik-example/data \
  --log-dir /tmp/lavik-example/logs
