redis-cli -h 127.0.0.1 -p 6379 PING
# PONG
redis-cli -h 127.0.0.1 -p 6379 SET greeting 'hello from Lavik'
# OK
redis-cli -h 127.0.0.1 -p 6379 GET greeting
# hello from Lavik
