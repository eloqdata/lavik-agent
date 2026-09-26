#!/bin/sh
# Rebuild into a fresh output directory. Keep the signing key across releases.
set -eu
cd "$(dirname "$0")/.."
mkdir -p .cache/apt-downloads .secrets/apt-signing
chmod 700 .secrets .secrets/apt-signing
output=${LAVIK_APT_BUILD_DIR:-.cache/apt-build}
mkdir -p "$output"
output=$(cd "$output" && pwd)
docker build -t lavik-apt-builder:beta1 packaging/apt
docker run --rm --cap-drop=ALL --security-opt=no-new-privileges \
  -e LAVIK_APT_INITIALIZE_KEY="${LAVIK_APT_INITIALIZE_KEY:-0}" \
  -v "$PWD/packaging/apt:/inputs:ro" \
  -v "$PWD/content/downloads/0.1.0.json:/release-lock.json:ro" \
  -v "$PWD/.cache/apt-downloads:/downloads" \
  -v "$PWD/.secrets/apt-signing:/signing" \
  -v "$output:/work" lavik-apt-builder:beta1
