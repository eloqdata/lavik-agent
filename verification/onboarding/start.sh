#!/bin/sh
set -eu
# A named volume keeps this data file across container replacement.
# Allocate only on the first start; never truncate existing data.
if [ ! -e /var/lib/lavik/data ]; then
  fallocate -l 512M /var/lib/lavik/data
fi
exec /opt/lavik/lavik --bind 0.0.0.0 --port 6379 --metrics-port 9100 \
  --network kernel --storage uring --threads 2 --no-pin-workers \
  --registered-buffer-mb-per-worker 64 --max-memory 512MiB \
  --shutdown-checkpoint --data-file /var/lib/lavik/data \
  --log-dir /var/lib/lavik/logs "$@"
