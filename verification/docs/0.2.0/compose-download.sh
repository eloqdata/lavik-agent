# Run in Bash; stop on a failed download, checksum, extraction or image pull.
set -euo pipefail
mkdir -p lavik-0.2.0-build
cd lavik-0.2.0-build
curl -fLO --retry 3 https://github.com/eloqdata/lavik-agent/releases/download/docker-v0.2.0-2/docker-source.tar.gz
printf '%s\n' '2e7493cd2e1a4d5c115589aa3bd599ef8366779cb722b93baba7a096535b1d9d  docker-source.tar.gz' | sha256sum -c -
tar -xzf docker-source.tar.gz
cd lavik-0.2.0-docker
docker compose pull
