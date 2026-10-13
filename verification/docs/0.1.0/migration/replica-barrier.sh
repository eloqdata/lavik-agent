# Connect directly to one CURRENT Lavik Owner. Keep this connection open.
redis-cli -h 127.0.0.1 -p 6371 --askpass
# Enter these commands at that interactive prompt, not in separate invocations:
# SET __lavik_migration__:{group1-probe}:barrier ready NX
# DEL __lavik_migration__:{group1-probe}:barrier
# WAIT 1 5000
# Require SET -> OK, DEL -> 1 and WAIT -> at least 1 for a one-replica Group.
# Choose a private, unused marker key whose slot belongs to THIS Owner.
# Repeat for each Group; adjust WAIT's count to its required replica count.
