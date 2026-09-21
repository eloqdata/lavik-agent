# Download page maintenance

The English and Chinese Download pages list the four Linux packages from
`content/downloads/0.1.0.json`, a snapshot of GitHub's public release API for
`v0.1.0-beta.1`. `packages/content/downloads.ts` validates the release identity,
asset URLs, digest format, and the Minimal digests against the existing release
lock. It supplies both the page and the executable shell examples.

The saved `evidence/downloads/0.1.0/README.md` is the README at the release's
source commit. Hardware and platform requirements come from that file and the
release notes, rather than the changing default branch.

To recheck download commands, with Docker running:

```sh
node --import tsx scripts/verify-downloads.ts
```

This builds a small Linux verifier image and runs the exact download,
checksum, and extraction commands shown by each card. Additional assertions
compare archive bytes with the GitHub API digest, inspect VERSION and REVISION,
and check the packaged executables and license are present. The containers
have a read-only root filesystem and bounded temporary storage, with no API
credentials or repository/environment-file mount. Network access is needed
for Ubuntu package installation and public GitHub downloads.

The resulting receipt records commands, results, Docker image ID, and input
hashes in `evidence/downloads/0.1.0/verification.json`. Unit tests reject stale
receipts. The manual's independent local review also includes these files.
Reverification changes the receipt and requires a new review before publishing.

These checks validate downloads and package identity; they do not execute all
four server binaries or assert performance, CPU, or kernel compatibility.
The separate command and client suites retain their own runtime evidence.

After a new release, add its own snapshot and verification evidence, update
the versioned release configuration, and review the resulting pages. Do not
silently replace the historical 0.1.0 packages with a nightly build.
