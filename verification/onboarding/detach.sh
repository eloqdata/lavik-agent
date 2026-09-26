# Only after source writers are paused and all source streams are caught up.
# Never detach a target that is still LOADING or incompletely synchronized.
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" REPLICAOF NO ONE
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" ROLE
# Runtime attachment turns Tomb Raider off. Re-enable its cleanup schedule.
redis-cli -h "$LAVIK_HOST" -p "$LAVIK_PORT" TOMBRAIDER INTERVAL 1000
