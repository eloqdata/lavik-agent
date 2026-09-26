# APT publishing

The public endpoint is `https://lavik.dev/apt/`, distribution `noble`, component
`main`, architectures `amd64` and `arm64`. `lavik` packages Minimal; the mutually
exclusive `lavik-standard` packages Standard. Debian version `0.1.0~beta.1-1`
represents upstream `0.1.0-beta.1` plus packaging revision 1. A final `0.1.0-1`
sorts above this prerelease. Only Ubuntu 24.04 is supported initially.

`packaging/apt/build.py` checks the upstream download SHA-256, VERSION and
REVISION before packaging all three binaries and their release license notices.
It uses aptly's local repo → immutable snapshot → signed filesystem publication,
with by-hash indexes. Clients use a dedicated `Signed-By` key, never `apt-key`,
`trusted=yes` or an unsigned repository.

## Signing and release artifacts

Run `sh scripts/build-apt.sh` into a **fresh** `LAVIK_APT_BUILD_DIR`. It runs the
pinned Ubuntu tooling container; aptly is installed from Ubuntu's repository.
For an intentional first-time setup only, set `LAVIK_APT_INITIALIZE_KEY=1`.
Otherwise a missing signing key fails closed. The signing key lives under ignored `.secrets/apt-signing`
(mode 0700), with a two-year expiration. Back up this directory securely.
Do not put it in a release, repository, static directory or model prompt.
The private key is not required for routine website builds or deployments.
Record a renewed key/signature snapshot before key expiration. Keep the old
public key available while clients transition. Key generation must never
silently replace a lost production key.

The public-only archive is `lavik-apt-0.1.0-beta.1-1.tar.gz`. It contains the
aptly publication tree and armored public key, not the private aptly database
or signing directory. It is stored in this repository's GitHub release
`apt-v0.1.0-beta.1-1`. The exact archive SHA-256 and every asset's SHA-256/size
are locked in `packages/apt/manifest.json`; public-key bytes are also tracked.
Do not overwrite published packages at an existing version or clobber this
release asset. Increment the Debian packaging revision for packaging fixes.

`stage-apt.ts` checks the archive hash, then the complete extracted asset list,
file sizes and hashes before staging into `apps/web/out/apt`. Every file must
fit Cloudflare's 25 MiB per-asset limit. The normal build includes this step,
so every subsequent website deployment retains the package repository.
The endpoint is ordinary Cloudflare Static Assets; no aptly daemon, R2 bucket,
new server or runtime credentials are required. `_headers` avoids content
transformations and uses short cache lifetimes for metadata.

## Verification and maintenance

`node --import tsx scripts/stage-apt.ts .cache/apt-staged` prepares a local copy.
`python3 scripts/verify-apt.py` installs both variants through signed APT in a
fresh native Ubuntu 24.04 container. It checks versions, the systemd unit with
`systemd-analyze verify`, the exact unit startup program as the service user,
writes, graceful restart, allocation preservation, conffile retention,
purge/reinstall recovery, and rejection of an incorrect signing key.
The container does not boot systemd; the receipt does not certify actual
system-manager enable/restart or SPDK hardware operation. Native AMD64 CI runs
the same check into `.cache/ci-verification/apt.json` without overwriting the
reviewed local receipt. After deployment run `python3 scripts/verify-apt.py live
.cache/apt-live.json` to check the HTTPS endpoint end to end.

The service is initially stopped, listens on loopback, and uses io_uring for
both variants. Configuration is `/etc/default/lavik`; data and logs persist
under `/var/lib/lavik` and `/var/log/lavik`, even on purge. Existing running
services are restarted on package upgrades, subject to system policy. Removal
stops the service; purge also clears tracked systemd enablement without deleting data. Backups and a maintenance window remain the operator's
responsibility. Meta/cluster services are not created automatically.

For later releases, extend the release lock/build matrix, preserve old pool
files and by-hash indexes needed by existing metadata, add packages under new
versions, publish a new aptly snapshot with the **same trusted signing key**,
test both architectures, and replace the locked public artifact only after
independent review. Do not regenerate a new key on an ephemeral CI runner.

Primary references: [aptly publishing](https://www.aptly.info/doc/aptly/publish/snapshot/),
[APT Signed-By](https://manpages.debian.org/testing/apt/sources.list.5.en.html),
[Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/).
