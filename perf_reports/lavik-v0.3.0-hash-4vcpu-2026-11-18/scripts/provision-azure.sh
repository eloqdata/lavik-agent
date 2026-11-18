#!/bin/bash
set -euo pipefail
: "${PUBLIC_KEY_FILE:?Set PUBLIC_KEY_FILE to your SSH public key file}"
: "${ADMIN_CIDR:?Set ADMIN_CIDR to your admin public IPv4 address with /32}"
BENCH_GROUP=${BENCH_GROUP:-lavik-hash-bench-reproduction}
BENCH_REGION=${BENCH_REGION:-eastus}
BENCH_ZONE=${BENCH_ZONE:-3}
BENCH_IMAGE=${BENCH_IMAGE:-Canonical:ubuntu-24_04-lts:server:24.04.202610250}
if [ "$(az group exists --name "$BENCH_GROUP")" = true ]; then
  echo 'Choose a fresh BENCH_GROUP; refusing to reuse existing resources.' >&2
  exit 1
fi
az group create --name "$BENCH_GROUP" --location "$BENCH_REGION" --tags purpose=ycsb-hash-benchmark
az network vnet create -g "$BENCH_GROUP" -n bench-vnet --address-prefixes 10.83.0.0/16 --subnet-name bench-subnet --subnet-prefixes 10.83.0.0/24
az network nsg create -g "$BENCH_GROUP" -n bench-nsg
az network nsg rule create -g "$BENCH_GROUP" --nsg-name bench-nsg -n AdminSSH --priority 100 --source-address-prefixes "$ADMIN_CIDR" --destination-port-ranges 22 --access Allow --protocol Tcp
az vm create -g "$BENCH_GROUP" -n bench-server --location "$BENCH_REGION" --zone "$BENCH_ZONE" --size Standard_L4aos_v5 --image "$BENCH_IMAGE" --admin-username bench --ssh-key-values "$PUBLIC_KEY_FILE" --vnet-name bench-vnet --subnet bench-subnet --nsg bench-nsg --public-ip-sku Standard --os-disk-size-gb 64 --storage-sku StandardSSD_LRS --accelerated-networking true --tags purpose=ycsb-hash-benchmark
az vm create -g "$BENCH_GROUP" -n bench-client --location "$BENCH_REGION" --zone "$BENCH_ZONE" --size Standard_L16aos_v5 --image "$BENCH_IMAGE" --admin-username bench --ssh-key-values "$PUBLIC_KEY_FILE" --vnet-name bench-vnet --subnet bench-subnet --nsg bench-nsg --public-ip-sku Standard --os-disk-size-gb 64 --storage-sku StandardSSD_LRS --accelerated-networking true --tags purpose=ycsb-hash-benchmark
