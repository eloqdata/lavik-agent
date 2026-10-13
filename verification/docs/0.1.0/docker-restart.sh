docker stop --time 60 lavik
docker start lavik
docker exec lavik redis-cli GET greeting
