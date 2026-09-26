docker restart -t 60 lavik
# Wait for PING to return PONG, then read the saved value.
docker exec lavik redis-cli PING
docker exec lavik redis-cli GET hello
