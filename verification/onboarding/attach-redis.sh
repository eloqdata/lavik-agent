# Run from a trusted host with redis-cli; use a fresh standalone Lavik target.
# These variables must identify your private-network endpoints.
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" REPLICAOF "$REDIS_HOST" "$REDIS_PORT"
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" INFO replication
