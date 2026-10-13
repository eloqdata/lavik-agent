docker compose exec -T primary redis-cli -c SET greeting 'hello from Lavik'
docker compose exec -T primary redis-cli -c GET greeting
docker compose exec -T follower redis-cli --raw <<'COMMANDS'
READONLY
GET greeting
COMMANDS
