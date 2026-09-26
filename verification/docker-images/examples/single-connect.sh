docker logs --tail 50 lavik
docker exec lavik redis-cli PING
docker exec lavik redis-cli SET hello lavik
docker exec lavik redis-cli GET hello
