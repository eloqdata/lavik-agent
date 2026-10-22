# Run in Bash; stop on a failed download, checksum, extraction or build.
set -euo pipefail
mkdir -p lavik-0.2.0-build
cd lavik-0.2.0-build
curl -fLO --retry 3 https://lavik.dev/installation-assets/0.2.0/docker-source.tar.gz
printf '%s\n' '3832426121dba1714fe154e33271351174da79d01d10002851584d88541cd637  docker-source.tar.gz' | sha256sum -c -
tar -xzf docker-source.tar.gz
cd lavik-0.2.0-docker
docker build --target cluster -t lavik:0.2.0-cluster .
