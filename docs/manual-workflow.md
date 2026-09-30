# Local manual workflow

The 0.1.0 manual uses the exact `v0.1.0-beta.1` binary and source commit in
`content/releases/0.1.0.json`. Valkey's documentation supplies the organizational
reference; Lavik source and actual Docker results determine compatibility.

The local coordinator runs repository-owned command and client tests, supplies
their results to a ChatGPT-authenticated Codex writer, starts a fresh Codex
reviewer, and permits publication only for the reviewed file hashes. Hosted
Admin and scheduled API-backed model workers remain disabled.

## Authentication and limits

Run `codex login` and choose ChatGPT. The launcher forces the built-in OpenAI
provider and `forced_login_method="chatgpt"`, ignores user configuration, and
passes an environment allowlist. It never reads `.env` or passes API keys,
Azure endpoints, GitHub tokens or Cloudflare credentials to Codex. A global
Azure provider configuration therefore does not control this launcher.

The model is explicitly `gpt-6-astra`: writer reasoning `medium`, reviewer
reasoning `high`. Each invocation has a 20-minute timeout. Each task directory
allows at most two writer calls and two reviewer calls, including failures.
An explicit `--additional-review=reason` argument to `manual:review` can use
an unused writer slot for one third review, while retaining the four-call
total limit. The reason is recorded in the receipt; normal runs keep the
two-review limit. This is never an automatic retry or a quota fallback.
For this September 26 infrastructure task, the owner explicitly authorized up to
two further corrective reviews after the first three. The launcher supports this
only through `authorizedCorrectiveReviewReason`, records that reason, and caps the
same task directory at five reviewer attempts and five total attempts. Background
blog tasks never set this extension. It must not be used without explicit owner
authorization; default budgets remain unchanged.
For a multi-article batch, the coordinator can explicitly request one further
infrastructure review with `additionalBatchReviewReason` (maximum 120 characters).
This allows at most four reviewer calls and five total calls in the same task
directory, including failed attempts. It records the reason in the receipt and
does not change normal task limits. `review-blog-batch.ts` exposes this as
`LAVIK_BATCH_REVIEW_REASON`; it must be set deliberately for that invocation.
Manual review has no background loop, silent model replacement, quota retry or
API fallback. The separately authorized [marketing scheduler](marketing-operations.md)
runs a bounded blog task every two days using the same subscription launcher.
These runs use ChatGPT's Codex allowance and remain subject to its
usage limits; they are not unlimited or offline model inference.

Private prompts, outputs and event logs live under ignored `.runs/local/`.
Only reviewed content, test programs and sanitized evidence are published.
The models receive a fixed evidence packet and have shell and web tools
disabled. Execution happens in the coordinator's Docker harness; model-written
code does not run automatically. Future test additions are repository changes
that must be inspected before execution.

## Reproduce the evidence

Requirements: Docker Desktop running Linux containers, Python 3, Node 22+,
the repository dependencies, and the existing pinned verifier image.

1. `npm run verify:prepare` downloads and checks the release package and builds
   `lavik-doc-verifier:0.1.0` if it is not available.
2. `npm run verify:manual` runs all 217 command cases. Reports go to
   `.runs/local/manual/commands.json`; a failure exits nonzero.
3. `npm run verify:clients:prepare` builds the language runtimes and fixed
   direct dependency versions. Dependency installation needs internet access.
4. `npm run verify:clients` runs every profile in
   `verification/manual/clients/catalog.json`. Results go to
   `.runs/local/manual/clients.json`.

Test execution itself uses `--network=none`, no host ports, a read-only root
filesystem, dropped capabilities, memory/CPU/time bounds, and a disposable
tmpfs database. The seccomp restriction is relaxed for io_uring. Only the
test directory is mounted read-only; credentials and the repository root
are not mounted. The literal `manual-test-only` password is a disposable
fixture, not a production credential.

The command suite checks exact replies, selected errors, Pub/Sub delivery,
transaction conflict handling, binary DUMP/RESTORE, Lua functions, complete
SCAN traversal and a graceful restart. It is not an exhaustive test of all
options, TLS, cluster operation, failover, crash durability or NVMe performance.
`ADDREPLICAOF` currently has a rejection-only test. Individual command pages
identify limited administrative coverage. Client tests list their exact native
or raw-command operations and protocol settings; a passing profile is not a
claim that every library API works.

ioredis and iovalkey profiles use `disconnect()` for cleanup. Separate
`quit()` probes completed their command assertions and cleanup calls, but
their Node.js processes remained alive after 12 seconds. The client pages
show this limitation; `shutdownProbes` in the client receipt preserves it.

## Writer, reviewer and publisher

The reusable launcher accepts a role, private task directory, prompt file and
JSON schema file:

```
npm run agent:local -- writer .runs/local/my-task prompt.txt schema.json
```

The writer receives a snapshot of the command registry, curated test cases,
actual Docker receipts and relevant source descriptions. Its structured
bilingual output becomes `content/manual/0.1.0/catalog.json` after inspection.
`cases.json` is generated from `verification/manual/cases.py`; it must not be
edited independently. A refresh can generate it with:

```
python3 verification/manual/cases.py > content/manual/0.1.0/cases.json
```

After inspecting successful receipts, copy them into
`evidence/manual/0.1.0/commands.json` and `clients.json`. Run formatting and
checks before review so the reviewer sees final bytes. Then run:

```
npm run manual:review
```

For a separate new task that changes the manual, use its own task directory:

```
npm run manual:review -- --task-directory=.runs/local/site-expansion-20260921
```

Keep all retries for that task in the same directory so the per-task call
budget remains effective. A new directory is for new work, not extra retries.

The independent review checks the complete public bundle in a fresh local
Codex session. A pass writes `evidence/manual/0.1.0/publication.json`, binding
source, content, test code, receipts, renderer and client configuration to
SHA-256 hashes. A failed review leaves the bundle unpublished; correct the
reported issues, rerun affected Docker tests, and use the remaining review
attempt. Changes to reviewed manual content, evidence, or meaning-bearing code
during or after review invalidate its approval.

On September 29, 2026, the owner requested automatic deployment for repository
pushes without local testing. Website deployment and manual content approval now
have separate scopes. Push to `main`; GitHub runs the Linux verification, content
checks, build, and browser suites, then deploys the tested artifacts to Cloudflare
and verifies the live revision. No local test run, local server, or model call is
required for a website-only change. Pull requests verify without deploying.

`npm run check` includes the manual publication gate. Both the page renderer and
manifest export still require valid evidence and review, so invoking Next directly
does not bypass content validation. The gate binds versioned prose, commands,
clients, source/evidence files, verification inputs, package contents, and code
that determines the meaning of the manual. Website-only files such as homepage
animations, styles, navigation, dependency lockfiles, and CI configuration are
validated by GitHub CI instead of invalidating unchanged manual approval.

The original review manifest and its digest remain intact. The gate checks its
integrity, then requires an exact match of the current manual-content subset,
including its file inventory. It never stamps new website bytes as independently
reviewed. Full-bundle infrastructure review remains available through
`scripts/review-site.ts`, but is optional for website-only changes. Changes to
technical content and independent article approvals retain their existing review
requirements. `/manual-manifest.json` reports `reviewScope: manual-content`, the
current `contentBundleHash`, and the original review's `bundleHash`. Live
deployment identity is reported separately by `/discovery-manifest.json`.

The website contains the English and Chinese editions under `/en/docs/0.1.0/`
and `/zh-CN/docs/0.1.0/`. CI performs the live verification after deployment.

For another release, add a separate version directory, release lock, source
inventory, examples, receipts and review. Do not overwrite 0.1.0 evidence
with results from `main` or a newer binary.
