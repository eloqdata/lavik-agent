#!/bin/bash
set -euo pipefail
swapoff -a
sysctl -w vm.overcommit_memory=1
printf 'never\n' > /sys/kernel/mm/transparent_hugepage/enabled
