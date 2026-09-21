# Use-case pages and evidence

The Use cases menu groups four workloads and three industries. The bilingual
reference architectures live in `packages/use-cases/content.ts`; shared rendering
is in `apps/web/components/use-cases.tsx`. These pages describe proposed
architectures and evaluation criteria. They do not imply existing customers,
framework certification, or workload-specific production SLAs.

Every page includes one small command scenario executed against the same pinned
Lavik 0.1.0 binary used by the command reference. Scenario definitions and the
offline runner live in `verification/use-cases/`. Run them locally with:

```sh
python3 scripts/verify-use-cases.py
```

This requires the existing `lavik-doc-verifier:0.1.0` Docker image. It uses no model
or Azure credentials. The resulting public receipt records actual replies,
release and binary identity, Docker isolation and hashes of the execution
harness. Rerun it whenever the scenarios or harness change. The seven examples
prove the displayed command interactions; they do not exercise application
frameworks, failover, sustained load, or the benchmark hardware.

The benchmark explorer uses the pinned September 18 beta storage CSV: one billion
1 KiB values, six NVMe SSDs, six measured connection counts, GET and SET. It selects
the highest observed QPS satisfying the selected p99 bound, with no interpolation.
A missing result means none of the published samples met that bound. Both Lavik
and competitor advantages are retained. Peer controls were reused from earlier
runs on the same hosts. The separate August 12 comparison includes Kvrocks, uses
200 million keys and different settings, and must not be combined with the beta
results. Report links and configuration/durability limitations accompany both.

Source snapshots and their manifest are in `evidence/use-cases/0.1.0/`. Update the
pinned revision, manifest and page context together when refreshing benchmarks.
The 20× cost assertion describes value-capacity media arithmetic at a stated
20:1 DRAM/SSD price ratio; complete deployment sizing also includes index memory,
CPU, replication, amplification and headroom.

These pages are part of the exact manual publication bundle. The gate rejects
stale sources, missing or unsuccessful scenarios, altered actual replies and
unreviewed content. After editing and verifying, request a fresh independent
review using the existing local ChatGPT-authenticated Codex wrapper:

```sh
npm run manual:review -- --task-directory=.runs/local/your-task-name
npm run check
LAVIK_BROWSER_TEST_PORT=4177 npm run test:browser
```

The review wrapper excludes API credentials and forces ChatGPT subscription
authentication. Keep one task directory throughout a task and honor its review
budget. Commit the successful publication receipt with the reviewed changes.
GitHub Actions verifies and deploys pushes to `main`; hosted Admin stays disabled.
