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
For a multi-article batch, the coordinator can explicitly request one further
infrastructure review with `additionalBatchReviewReason` (maximum 120 characters).
This allows at most four reviewer calls and five total calls in the same task
directory, including failed attempts. It records the reason in the receipt and
does not change normal task limits. `review-blog-batch.ts` exposes this as
`LAVIK_BATCH_REVIEW_REASON`; it must be set deliberately for that invocation.
No background loop, silent model replacement, quota retry or API fallback
exists. These runs use ChatGPT's Codex allowance and remain subject to its
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
attempt. Changes made during or after review invalidate the approval.

`npm run check` includes the manual publication gate. Both the page renderer
and manifest export also require valid evidence and review, so running Next
directly does not bypass validation. The review includes these export paths,
the package scripts and the CI workflow. Push the approved bundle
to `main` to use the existing GitHub → Cloudflare deployment workflow. This
deployment does not run a model. Verify `/manual-manifest.json` and the live
command/client pages after CI succeeds. The website contains the English and
Chinese editions under `/en/docs/0.1.0/` and `/zh-CN/docs/0.1.0/`.

For another release, add a separate version directory, release lock, source
inventory, examples, receipts and review. Do not overwrite 0.1.0 evidence
with results from `main` or a newer binary.
