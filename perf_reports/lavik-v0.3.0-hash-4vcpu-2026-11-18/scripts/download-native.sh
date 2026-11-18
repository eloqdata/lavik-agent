#!/bin/bash
set -euo pipefail
cd /opt/bench
curl --retry 3 -fL https://github.com/eloqdata/lavik/releases/download/v0.3.0/lavik-v0.3.0-linux-x86_64-minimal.tar.gz -o lavik.tar.gz
curl --retry 3 -fL https://github.com/eloqdata/lavik/releases/download/v0.3.0/lavik-v0.3.0-linux-x86_64-minimal.tar.gz.sha256 -o lavik.sha256
expected=$(cut -d ' ' -f1 lavik.sha256)
actual=$(sha256sum lavik.tar.gz | cut -d ' ' -f1)
test "$expected" = "$actual"
mkdir -p lavik-release dragonfly-release
tar -xf lavik.tar.gz -C lavik-release
curl --retry 3 -fL https://github.com/dragonflydb/dragonfly/releases/download/v2.1/dragonfly-x86_64.tar.gz -o dragonfly.tar.gz
tar -xf dragonfly.tar.gz -C dragonfly-release
sha256sum lavik.tar.gz dragonfly.tar.gz > binary-checksums.txt
