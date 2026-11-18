#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq openjdk-17-jdk-headless maven git curl jq python3 python3-redis redis-tools sysstat build-essential cmake ninja-build pkg-config libssl-dev libnuma1 libuuid1 libtool autoconf automake unzip
mkdir -p /opt/bench/bin /opt/bench/results
chown -R bench:bench /opt/bench
