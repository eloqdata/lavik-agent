#!/bin/bash
set -euo pipefail
: "${BENCH_DEVICE:?Set BENCH_DEVICE to the verified EMPTY Azure local NVMe scratch disk}"
[ -b "$BENCH_DEVICE" ]
[ "$(lsblk -dn -o TYPE "$BENCH_DEVICE")" = disk ]
model=$(lsblk -dn -o MODEL "$BENCH_DEVICE")
case "$model" in *Microsoft*NVMe*Direct*) ;; *) echo 'Refusing a disk that is not Azure local direct NVMe.' >&2; exit 1;; esac
mounted=$(lsblk -nr -o MOUNTPOINTS "$BENCH_DEVICE" | sed '/^[[:space:]]*$/d')
if [ -n "$mounted" ]; then
  echo 'Refusing a disk with mounted filesystems.' >&2; exit 1
fi
if [ -n "$(wipefs --noheadings --output TYPE "$BENCH_DEVICE")" ]; then
  echo 'Refusing a disk with an existing signature.' >&2; exit 1
fi
mkfs.ext4 -E lazy_itable_init=0,lazy_journal_init=0 -L BENCH_SCRATCH "$BENCH_DEVICE"
mkdir -p /mnt/bench
mount "$BENCH_DEVICE" /mnt/bench
chown bench:bench /mnt/bench
