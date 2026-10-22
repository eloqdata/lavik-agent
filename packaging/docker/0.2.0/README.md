# Lavik 0.2.0 containers

The published images support Linux AMD64 and ARM64 and use the checksum-verified
Minimal release archives (kernel TCP/io_uring, without SPDK or Lavik Admin).

```sh
docker pull eloqdata/lavik:0.2.0
docker pull eloqdata/lavik:0.2.0-cluster
docker compose pull
docker compose up -d
```

Compose uses the cluster image, three Meta voters and a primary/follower pair.
Keep the named volumes across restarts. This single-host example is not host-level HA.
See https://lavik.dev/en/docs/0.2.0/ for connection, readiness and recovery commands.

To build locally from the pinned release instead:

```sh
docker build --target single -t lavik:0.2.0 .
docker build --target cluster -t lavik:0.2.0-cluster .
LAVIK_DOCKER_IMAGE=lavik:0.2.0-cluster docker compose up -d
```
