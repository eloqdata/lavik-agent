#!/bin/bash
set -euo pipefail
cd /opt/bench
mkdir -p native-build native-bin
cd native-build
curl --retry 3 -fL https://codeload.github.com/redis/redis/tar.gz/refs/tags/8.10.3 -o redis-8.10.3.tar.gz
echo '85ae62e175cc76f638015fa18cb384b549b6808a765425d9e9d47466f69532ea  redis-8.10.3.tar.gz' | sha256sum --check
mkdir redis-8.10.3
tar -xf redis-8.10.3.tar.gz --strip-components=1 -C redis-8.10.3
make -C redis-8.10.3 -j16 BUILD_TLS=no > /opt/bench/native-redis-build.log 2>&1
cp redis-8.10.3/src/redis-server /opt/bench/native-bin/redis-server
curl --retry 3 -fL https://codeload.github.com/apache/kvrocks/tar.gz/refs/tags/v2.17.0 -o kvrocks-v2.17.0.tar.gz
echo '1e47c9b561e618f154ee7a610bb03b8636332cc239a4d6cbf72e301de654f6eb  kvrocks-v2.17.0.tar.gz' | sha256sum --check
mkdir kvrocks-v2.17.0
tar -xf kvrocks-v2.17.0.tar.gz --strip-components=1 -C kvrocks-v2.17.0
cd kvrocks-v2.17.0
./x.py build --ninja -j16 -DCMAKE_BUILD_TYPE=Release > /opt/bench/native-kvrocks-build.log 2>&1
cp build/kvrocks /opt/bench/native-bin/kvrocks
cp kvrocks.conf /opt/bench/native-bin/kvrocks.conf
cd /opt/bench/native-bin
sha256sum redis-server kvrocks > native-sha256.txt
ldd redis-server > redis-ldd.txt
ldd kvrocks > kvrocks-ldd.txt
./redis-server --version > redis-version.txt
./kvrocks --version > kvrocks-version.txt
