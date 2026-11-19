#!/bin/bash
set -euo pipefail
cd /opt/bench
curl --retry 3 -fL https://codeload.github.com/eloqdata/YCSB/tar.gz/247a2d448ebceff11a570a622c49ece161a27ed3 -o ycsb-updated-source.tar.gz
echo 'aa8cb40ad528c2ef326d17a5764e5251d2f94f01e2b4d2d7ee4c8f0b43eaab30  ycsb-updated-source.tar.gz' | sha256sum --check
mkdir YCSB-247a2d4
tar -xf ycsb-updated-source.tar.gz --strip-components=1 -C YCSB-247a2d4
cd YCSB-247a2d4
mvn -B -Psource-run -pl site.ycsb:redis-binding -am clean package > /opt/bench/redis-client-build.log 2>&1
sha256sum core/target/core-0.18.0-SNAPSHOT.jar redis/target/redis-binding-0.18.0-SNAPSHOT.jar > /opt/bench/ycsb-jar-sha256.txt
