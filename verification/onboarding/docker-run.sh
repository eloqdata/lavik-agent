docker build -t lavik-local:0.1.0-beta.1 .
docker run -d --name lavik-beta1 \
  -p 127.0.0.1:6379:6379 -p 127.0.0.1:9100:9100 \
  --mount source=lavik-beta1-data,target=/var/lib/lavik \
  --ulimit memlock=536870912:536870912 \
  --memory 1g --cpus 2 --read-only --tmpfs /tmp \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --security-opt seccomp:unconfined --stop-timeout 60 \
  lavik-local:0.1.0-beta.1
docker logs lavik-beta1
docker exec lavik-beta1 redis-cli PING
docker exec lavik-beta1 redis-cli SET greeting 'hello from Lavik'
docker exec lavik-beta1 redis-cli GET greeting
