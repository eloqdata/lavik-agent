#!/bin/bash
set -euo pipefail
product=${1:?};label=${2:?}
B=/opt/gaming-main-20261111
D="$B/results/$label"
test ! -e "$D"
mkdir -p "$D"
ulimit -n 65535
case "$product" in
 base)
  source /opt/gaming-20261109/devices.env
  args=();for pci in $LAVIK_NVME_PCI;do args+=("--data-file=spdk://$pci/1");done
  # Gaming churn uses normal maintenance; diagnostic-only pauses do not apply.
  exec sudo prlimit --memlock=unlimited:unlimited env BYCORF_EAL_ARGS="$LAVIK_EAL_ARGS" BYCORF_DPDK_MEMORY_MB="$(cat "$B/memory-mb")" taskset -c 0-15 "$B/bin/$product" --storage=spdk --bind=10.96.0.4 --metrics-port=9100 --shutdown-checkpoint --log-dir="$D/logs" "${args[@]}" > "$D/server.log" 2>&1
  ;;
 *) exit 2;;
esac
