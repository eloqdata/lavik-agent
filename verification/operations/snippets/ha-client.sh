# SET and WAIT must share a connection. WAIT is not a failover/durability guarantee.
redis-cli -c -h 127.0.0.1 -p 6371 --raw <<'COMMANDS'
SET greeting "hello from Lavik"
WAIT 1 5000
GET greeting
COMMANDS
# The replica redirects this read to the primary; -c follows that redirect.
redis-cli -c -h 127.0.0.1 -p 6372 GET greeting
redis-cli -h 127.0.0.1 -p 6371 CLUSTER SLOTS
