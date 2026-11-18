#!/bin/bash
set -euxo pipefail
cd /opt/bench
sudo apt-get update -qq
sudo apt-get install -y libnuma-dev libaio-dev uuid-dev meson nasm pkg-config python3-tabulate python3-pyelftools help2man
 git clone https://github.com/spdk/spdk.git spdk-probe-src
cd spdk-probe-src
git checkout d519b163cbc0e2f28c35d9bc86d610da368b032c
git submodule update --init dpdk isa-l isa-l-crypto
./configure --without-crypto --without-uring --without-vhost --without-virtio --without-fio --without-nvme-cuse --disable-tests --disable-unit-tests
make -j12

mkdir -p examples/nvme/queue_probe
cp /opt/bench/queue_probe.c examples/nvme/queue_probe/
sed s/hello_world/queue_probe/g examples/nvme/hello_world/Makefile > examples/nvme/queue_probe/Makefile
make -C examples/nvme/queue_probe -j4
sha256sum build/examples/queue_probe
