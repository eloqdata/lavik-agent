# Run in Bash; stop on a failed download, checksum, extraction or build.
set -euo pipefail
mkdir -p lavik-0.2.0-build
cd lavik-0.2.0-build
curl -fLO --retry 3 https://lavik.dev/installation-assets/0.2.0/docker-source.tar.gz
printf '%s\n' '33c7b7cbfdf4c4d9b9aab669d090b0c225801a00d16b6e6ad8662dddbaba1fbf  docker-source.tar.gz' | sha256sum -c -
tar -xzf docker-source.tar.gz
cd lavik-0.2.0-docker
docker compose pull
