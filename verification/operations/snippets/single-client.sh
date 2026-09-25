redis-cli -c -h 127.0.0.1 -p 6371 SET greeting 'hello from Lavik'
redis-cli -c -h 127.0.0.1 -p 6371 GET greeting
redis-cli -h 127.0.0.1 -p 6371 CLUSTER INFO
