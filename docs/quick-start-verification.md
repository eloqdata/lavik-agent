# Quick-start verification

The quick-start package selector uses the four pinned downloads from
`content/downloads/0.1.0.json`. Each generated command verifies the published
checksum, extracts the archive, enters its directory, and runs `./lavik --version`.
The shared startup recipe also uses `./lavik`; it does not rely on an installation
or a PATH entry, and does not replace the user's shell with `exec`.
The recipe runner removes the package directory from its own PATH before testing.
The shared verifier image keeps its PATH for the separate command/client harnesses.

Run the full package matrix with:

```sh
node --import tsx scripts/verify-quick-start.ts
```

This builds ARM64 and x86-64 Ubuntu Docker images with the displayed dependency
commands. It executes the displayed download/extract/version commands for all four
packages. For both packages matching the host architecture it also runs the shared
startup script, Redis commands, and a graceful restart. Foreign-architecture
packages receive version checks under emulation, not an io_uring runtime claim.
The report records exact commands, archive and input hashes, image identity, and
actual output in `evidence/quick-start/0.1.0/verification.json`.

Containers have a read-only root, bounded resources, dropped capabilities, an
executable disposable tmpfs for the downloaded binaries, and only a read-only
mount of the generated public command script. They need network access for public
GitHub downloads. They receive no API keys, env files, host disks or host devices.
No SPDK hardware test is claimed. The quick-start links the pinned, current
backend-selection instructions, rather than copying historical SPDK build paths.

After a startup-harness change, also refresh the ordinary recipe receipt:

```sh
npm run verify:prepare
npm run verify:examples -- --output-dir .runs/local/your-task/receipts
```

Changing this shared recipe affects the quick-start and the existing performance
article. Independently review their bilingual editions with the new execution
receipt and publish new immutable artifacts; never edit an old publication's
receipt. The shared manual approval must also cover the updated setup components,
evidence gate, and harness. Unchanged command/client fixtures keep their original
execution records. Hosted Admin and Azure model workers remain disabled.
