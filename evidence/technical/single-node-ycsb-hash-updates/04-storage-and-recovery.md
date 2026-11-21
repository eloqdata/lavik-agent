The storage subsystem owns Lavik's in-memory top-level key indexes and its
primary durable representation. It routes keys to worker-owned logical
partitions, appends immutable record versions, serves staged or disk-backed
reads, reconstructs indexes and physical accounting at startup, and reclaims
obsolete records and extents online.

