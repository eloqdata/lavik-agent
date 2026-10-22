#!/bin/bash
set -euo pipefail
# Direct benchmark return traffic through the data NIC, matching source IP.
if ip link show eth1 >/dev/null 2>&1; then
 ip rule show | grep -q 'from 10.96.1.4 lookup 96' || ip rule add from 10.96.1.4/32 table 96 priority 100
 ip route replace 10.96.1.0/24 dev eth1 src 10.96.1.4 table 96
 ip route replace default via 10.96.1.1 dev eth1 table 96
fi
sysctl -w vm.overcommit_memory=1
printf never > /sys/kernel/mm/transparent_hugepage/enabled
