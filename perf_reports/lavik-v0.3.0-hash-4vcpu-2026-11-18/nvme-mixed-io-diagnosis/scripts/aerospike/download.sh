#!/bin/bash
set -euo pipefail
mkdir -p /opt/bench/aerospike-download /opt/bench/aerospike-package
cd /opt/bench/aerospike-download
base=https://download.aerospike.com/artifacts/aerospike-server-community/8.1.2.4
name=aerospike-server-community_8.1.2.4_tools-13.0.2_ubuntu24.04_x86_64.tgz
curl -fL --retry 3 "$base/$name" -o "$name"
curl -fL --retry 3 "$base/$name.sha256" -o "$name.sha256"
sed "s@../aerospike@aerospike@" "$name.sha256" | sha256sum -c -
tar -xzf "$name"
find . -name '*.deb' -print
for deb in $(find . -name 'aerospike-server*.deb'); do dpkg-deb -x "$deb" /opt/bench/aerospike-package; done
/opt/bench/aerospike-package/usr/bin/asd --version
