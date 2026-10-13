# Lavik 0.1.0 Docker release

These server images package the official checksummed `v0.1.0` Minimal binaries
at commit `feb61224e414c5653fd09560e20c9d214db1e3ac`.

| Image                          | Contents                                          | Platforms                |
| ------------------------------ | ------------------------------------------------- | ------------------------ |
| `eloqdata/lavik:0.1.0`         | Standalone server and redis-cli                   | linux/amd64, linux/arm64 |
| `eloqdata/lavik:0.1.0-cluster` | Server, Meta, lavik-ctl, cluster bootstrap helper | linux/amd64, linux/arm64 |

The images use kernel TCP and io_uring; they do not include SPDK, Lavik Admin,
or its bundled Node.js runtime. The complete Admin package is available in the
[upstream release](https://github.com/eloqdata/lavik/releases/tag/v0.1.0).
They run as UID/GID 10001, with persistent data in `/data`.
Linux 6.1+ with io_uring enabled is required. Docker Desktop runs its own Linux VM.

## Standalone

```sh
docker pull eloqdata/lavik:0.1.0
docker volume create lavik-data
docker run -d --name lavik \
  --security-opt seccomp=unconfined \
  --ulimit memlock=536870912:536870912 \
  -p 127.0.0.1:6379:6379 -v lavik-data:/data \
  -e LAVIK_DATA_SIZE=1G -e LAVIK_THREADS=2 \
  eloqdata/lavik:0.1.0
docker exec lavik redis-cli PING
```

Docker's default seccomp policy blocks io_uring. The example relaxes seccomp,
without granting privileged mode. Ports bind to host loopback; configure
appropriate authentication/TLS before exposing the service elsewhere.
`LAVIK_DATA_SIZE` allocates a new file once; changing it never resizes an existing
database. Stop gracefully with `docker stop --time 60 lavik`.

## Primary/follower cluster

From this directory:

```sh
docker compose up -d
docker compose logs bootstrap
docker compose exec meta-1 lavik-ctl cluster-status \
  --socket /data/meta/meta-admin.sock --allow-plaintext-admin --json
docker compose exec primary redis-cli SET example value
docker compose exec follower sh -c 'printf "READONLY\nGET example\n" | redis-cli'
```

The example has three Meta voters and two Data nodes in one Group. It uses
Cluster client mode. Data starts before bootstrap but opens its Redis port only
after Meta commits the creation manifest. The bootstrap helper observes existing
state on restart; it never blindly repeats an uncertain cluster-create.
Meta only receives the initial manifest when its durable `RAFT` marker is absent.

Restart with `docker compose restart`. Recreating containers with `docker compose
down` followed by `docker compose up -d` keeps named volumes. Do not use
`down --volumes` when data must be retained. The fixed private subnet
`172.30.92.0/24` must be free. This is a local example with internal plaintext
administration, not a multi-host production security configuration.

These images are for stable-release data directories. Beta Meta uses a different
Raft engine and the beta cluster command flags have been removed; do not replace
a running beta cluster's image tag as an in-place migration procedure.

## Build, verify and publish

From the repository root:

```sh
docker buildx build --platform linux/amd64,linux/arm64 --target single --load \
  -t eloqdata/lavik:0.1.0 packaging/docker/0.1.0
docker buildx build --platform linux/amd64,linux/arm64 --target cluster --load \
  -t eloqdata/lavik:0.1.0-cluster packaging/docker/0.1.0
python3 packaging/docker/0.1.0/smoke-test.py --platform linux/arm64
```

Use native AMD64 Linux for the AMD64 smoke test. Emulation on ARM does not
certify io_uring behavior. The `Verify stable release artifacts` GitHub workflow
builds and tests both architectures on native runners. Its checks cover
standalone writes/restart/allocation, cluster replication, controlled failover,
and full cluster recovery. It also installs both signed APT variants.

After verification and packaging review, use Docker Hub credentials with write
access to `eloqdata/lavik`:

```sh
docker push eloqdata/lavik:0.1.0
docker push eloqdata/lavik:0.1.0-cluster
docker buildx imagetools inspect eloqdata/lavik:0.1.0
docker buildx imagetools inspect eloqdata/lavik:0.1.0-cluster
```

Preserve immutable release tags. No floating `latest` tag is assigned by this
workflow. Runtime Ubuntu packages are resolved at image build time, so retain
the published digest rather than assuming a later rebuild is byte-identical.
