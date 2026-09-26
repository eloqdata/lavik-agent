# Begin with one slot-owning Redis primary; never use a replica endpoint.
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" REPLICAOF "$REDIS_HOST" "$REDIS_PORT"
# Repeat ADDREPLICAOF for EVERY remaining slot-owning primary.
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" ADDREPLICAOF "$REDIS_HOST_2" "$REDIS_PORT_2"
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" ADDREPLICAOF "$REDIS_HOST_3" "$REDIS_PORT_3"
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" INFO replication
