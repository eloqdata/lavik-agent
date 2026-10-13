# First stop ALL application, job and administrative writers on Redis.
# Repeat for every source primary (7000, 7001, 7002, ... for a Cluster).
# --askpass avoids putting a password in shell history or process arguments.
# For an ACL user, also add: --user migration-reader
redis-cli -h 127.0.0.1 -p 6379 --askpass INFO server
redis-cli -h 127.0.0.1 -p 6379 --askpass INFO replication
# Record run_id, role:master, master_replid and master_repl_offset per primary.
