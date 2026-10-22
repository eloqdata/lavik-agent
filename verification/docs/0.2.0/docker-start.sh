# Run in Bash; stop on a failed download, checksum, extraction or build.
set -euo pipefail
mkdir -p lavik-0.2.0-build
cd lavik-0.2.0-build
curl -fLO --retry 3 https://lavik.dev/installation-assets/0.2.0/docker-source.tar.gz
printf '%s\n' '3832426121dba1714fe154e33271351174da79d01d10002851584d88541cd637  docker-source.tar.gz' | sha256sum -c -
tar -xzf docker-source.tar.gz
cd lavik-0.2.0-docker
docker build --target single -t lavik:0.2.0 .
docker run -d --name lavik \
  --security-opt seccomp=unconfined \
  --ulimit memlock=536870912:536870912 \
  -p 127.0.0.1:6379:6379 -v lavik-data:/data \
  -e LAVIK_DATA_SIZE=1G -e LAVIK_THREADS=2 \
  lavik:0.2.0
wait_for_lavik() {
  local attempt
  for attempt in {1..60}; do
    if [ "$(docker exec lavik timeout 3 redis-cli --raw PING 2>/dev/null)" = PONG ]; then
      return 0
    fi
    sleep 2
  done
  echo 'Lavik was not ready within 60 checks; inspect docker logs lavik.' >&2
  return 1
}
wait_for_lavik
