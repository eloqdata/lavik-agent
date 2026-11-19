#!/bin/bash
set -euo pipefail
swapoff -a
sysctl -w vm.overcommit_memory=0
printf "madvise\n" > /sys/kernel/mm/transparent_hugepage/enabled
