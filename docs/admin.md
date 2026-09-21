# Private agent console

**Disabled in production as of September 21, 2026.** `ADMIN_ENABLED=false` blocks
the hosted console, runner and publisher APIs and stops Durable Object alarms.
Stored task history is retained. Both GitHub model workflows are disabled and
`LAVIK_ADMIN_WORKER_ENABLED=false`; the scheduled trigger has been removed.
Public website deployment remains enabled. See [the local Codex team design](local-agent-team.md)
for the planned replacement. The operations below describe the retained system,
not an invitation to restart hosted API usage. Explicit local development/test
commands set `ADMIN_ENABLED=true` only for their local Worker process.

The console is at `https://lavik.dev/admin/`. It manages user manual writers,
blog writers, user manual reviewers and blog reviewers. Every task covers English
and Simplified Chinese. Writers send their drafts through independent review;
reviewers can audit an existing article without rewriting it.

## Use the console

1. Sign in through Cloudflare Access with `Zhanghuan929@gmail.com`.
2. Choose **Assign a task**, select an agent and describe the desired outcome.
   Select an existing article when reviewing or revising published material.
   The article catalog appears after the first worker heartbeat.
3. Open a task to see its current stage, both drafts, reviewer findings, command
   receipts, source links and event history. **Export task & evidence** downloads
   the saved result and complete event history. The panel displays the latest 200 events.
4. **Save feedback** records a comment. Comments saved before a worker claims the
   task are included in that attempt. Comments during execution apply to the next
   attempt, without changing an in-flight model conversation.
5. **Request revision** creates a linked writer task using the saved draft and
   feedback from its history. **Retry** creates another attempt after a failure.
   **Cancel task** invalidates its lease, stopping future updates and subsequent
   agent steps. An already running Docker command can take its bounded timeout to exit.

One task runs at a time. Queued tasks survive page closure, Worker deployments and
GitHub workflow delays. The dashboard displays the latest 100 tasks. Status is real
queue/worker state, refreshed every five seconds; these are roles executed on demand,
not four continuously running processes.

**Review passed queues automatic website publication.** Both language editions must
pass independent review and command verification. A separate publisher validates the
exact reviewed artifact, commits the bilingual content and immutable evidence,
deploys to Cloudflare, and checks both live pages before setting **Published**.
The task then shows its English and Chinese URLs. This applies to blog articles and
versioned user manuals, including updates to an existing article.

**Changes requested** remains a draft. Enter feedback and choose **Request revision**;
the previous review findings are carried into the new writer attempt automatically.
Typing "approved" is a comment, not a review override or publication command.
**Publication failed** preserves the reviewed draft. Correct the reported problem
and choose **Retry publication**, or request a revision if the evidence is stale.
Transient publication failures retry up to three attempts without rewriting or
calling a model again. An in-progress publication must finish before revision;
a revision requested while publication is queued cancels that pending publication.

Every publication freezes per-article command receipts and their checksums. New
publications use renderer v2 to display those receipts; the original renderer stays
available for older reviews so a feature deployment does not silently change what
was reviewed. Concurrent changes to an article prevent overwriting a newer version.

## Cloudflare Access setup

Production sign-in is configured. Open `https://lavik.dev/admin/`, enter the
configured administrator email, request a code, and enter the PIN from your inbox.
No further dashboard setup is needed. The instructions below document how to
recreate the configuration.

If One-time PIN is absent, first open Zero Trust → Integrations → Identity providers
→ Add new identity provider → One-time PIN. New organizations may not add it by default;
see [Cloudflare's PIN setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

Create one **Self-hosted** application in Cloudflare Zero Trust → Access → Applications.
Name it **Lavik Admin** and add both public hostnames to the same application:

| Domain      | Path          |
| ----------- | ------------- |
| `lavik.dev` | `/admin*`     |
| `lavik.dev` | `/api/admin*` |

Add an **Allow** policy whose **Emails** selector contains only
`Zhanghuan929@gmail.com`. Enable **One-time PIN** as a login method. Use a session
duration of 24 hours or less. Keep the public site and `/api/runner/*` outside this
Access application; the latter uses a separate worker credential.

Set these Worker configuration values:

| Name                 | Value                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `ADMIN_EMAIL`        | Already set in `wrangler.jsonc`                                               |
| `ACCESS_TEAM_DOMAIN` | Your team hostname, e.g. `your-team.cloudflareaccess.com`, without `https://` |
| `ACCESS_AUD`         | This application's Application Audience (AUD) tag                             |
| `RUNNER_TOKEN`       | A cryptographically random token of at least 32 characters                    |

The team domain and AUD identify the application and are not passwords. They can
be stored as Worker secrets to preserve account-specific settings across deployments:

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN --env-file /dev/null
npx wrangler secret put ACCESS_AUD --env-file /dev/null
npx wrangler secret put RUNNER_TOKEN --env-file /dev/null
```

Wrangler prompts for each value. Do not put secret values in tracked files. See
[Cloudflare's application setup](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
and [AUD/JWT validation instructions](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
Workers deployment permissions alone do not necessarily grant Access application management.

The Worker checks the signed Access JWT, issuer, audience, expiry and owner email.
An email header alone cannot authenticate. Missing sign-in configuration closes
admin access while the public website remains available. Mutations require
same-origin JSON requests. Task results never enter the public static export.

## Run agents without an open laptop

Submitting a task, revision, or retry schedules a Cloudflare Durable Object alarm
before the queue mutation. The alarm directly starts the **Process private admin
tasks** GitHub workflow, checks for an existing run before dispatching, and persists
startup status and retries. It monitors active runs and starts the next queued task
after a worker finishes. This continues with the browser and laptop closed.
The admin console shows startup failures, the next check, and a GitHub run link.

GitHub's five-minute schedule remains a best-effort backup, not the primary wake-up
mechanism. Worker setup and GitHub runner availability still affect start time.
An idle backup check records a heartbeat and skips Docker preparation/model calls.

Connect Cloudflare to GitHub once:

1. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new?name=Lavik%20worker%20dispatch&target_name=eloqdata&actions=write).
   Choose resource owner `eloqdata`, **Only select repositories → lavik-agent**, and
   repository permission **Actions → Read and write**. Complete organization approval
   if required. Set an expiry appropriate to your organization and rotate before it.
2. Install the token with `npx wrangler secret put GITHUB_DISPATCH_TOKEN --env-file /dev/null`.
   The optional ignored `.env` entry `LAVIK_GITHUB_DISPATCH_TOKEN` is a local setup
   input; setting it alone does not configure the deployed Worker.
3. Keep the GitHub execution settings below enabled. New tasks request startup
   automatically; an existing queue is recovered on its next admin/API request.

The dispatch token stays in Cloudflare and can start/inspect this repository's
workflows. Dispatch requests contain only the `main` ref, never task content.
The writing job retains read-only repository permissions. A GitHub App with
short-lived installation tokens is the future replacement for token rotation.

Startup requests are retried after checking GitHub; a lost response waits at least
two minutes before another dispatch. This is at-least-once delivery, with the queue's
single-task lease preventing concurrent execution of the same task. A worker whose
task lease expires is marked failed for inspection, not automatically rerun.
GitHub/credential failures back off up to five minutes and remain visible.

For an operational check, a trusted runner can send `POST /api/runner/wake` with an
empty JSON object and its bearer credential. This durably requests a startup probe;
the next valid worker heartbeat clears it. An empty queue incurs no model calls.
`GET /api/runner/status` with the same credential reports queue counts, task IDs,
stages and dispatcher status without briefs, drafts or feedback.

Configure the following repository secrets and variables before enabling it:

| GitHub setting                                                                             | Purpose                                                              |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Secret `LAVIK_RUNNER_TOKEN`                                                                | Same value as the Worker's `RUNNER_TOKEN`                            |
| Secret `OPENAI_API_KEY`                                                                    | Azure/OpenAI credential used only by the execution step              |
| Secret `LAVIK_PUBLISHER_TOKEN`                                                             | Separate publisher credential, matching Cloudflare `PUBLISHER_TOKEN` |
| Variables `OPENAI_BASE_URL`, `LAVIK_WRITER_MODEL`, `LAVIK_REVIEWER_MODEL`                  | Explicit endpoint and deployment names                               |
| Variables `LAVIK_WRITER_REASONING_EFFORT`, `LAVIK_REVIEWER_REASONING_EFFORT`               | Explicit reasoning effort for each role                              |
| Variables `LAVIK_WRITER_MAX_TOKENS`, `LAVIK_REVIEWER_MAX_TOKENS`, `LAVIK_AGENT_TIMEOUT_MS` | Invocation budgets                                                   |
| Variable `LAVIK_ADMIN_WORKER_ENABLED=true`                                                 | Enable automatically dispatched and backup execution                 |

The writer job has read-only repository permissions. A separate publisher job has
repository write and Cloudflare deployment credentials, and receives no model key.
Neither job uploads private drafts, briefs, feedback or transcripts as GitHub artifacts. The repository is public;
workflow logs report only operational status and task IDs. Detailed model events
and results go to authenticated Cloudflare storage. Anyone able to change trusted
workflows can potentially use their credentials, so repository write access matters.

Set the publisher token once in GitHub Actions as `LAVIK_PUBLISHER_TOKEN` and in
Cloudflare using `npx wrangler secret put PUBLISHER_TOKEN --env-file /dev/null`.
Use a separate random credential of at least 32 characters. Publishing also uses
the existing Cloudflare deployment token and `LAVIK_AUTO_DEPLOY=true` setting.
The writing and publication jobs run from trusted `main` only. Publication and
ordinary website deployments share a concurrency group with queued delivery.

`scripts/admin-publish.ts` reads the durable publication outbox. Only the reviewed
article, sanitized review provenance, immutable execution receipts and manifest go
into the public repository. Briefs, feedback, model endpoint details and transcripts
stay private. A successful Git push is not a Published result: the publisher also
requires a Cloudflare version ID, the deployed `/publication-manifest.json`, and
the correct content hash on both live pages. A lost callback can safely retry using
the same artifact without making a duplicate commit.

The authenticated `/api/publisher/review` endpoint accepts a request UUID and an
existing catalog `articleId` to queue a fresh independent publication review. It
does not accept a review verdict or new content. This supports testing the full
pipeline and renewing evidence for existing website articles.
If such a publisher-requested review reports findings, `/api/publisher/revise`
accepts its task ID and a new request UUID to start a linked writer revision. This
endpoint is limited to those review tasks and cannot override a verdict or mark
anything Published. The writer verifies commands and runs independent review again.

To use a local worker with the production console instead, set `LAVIK_ADMIN_URL`
and `LAVIK_RUNNER_TOKEN` in the ignored `.env` alongside the model settings:

```sh
npm run verify:prepare
npm run admin:worker
```

`-- --once` processes at most one task. The local loop checks every 15 seconds.
Both local and GitHub runners obey the same lease, so they cannot claim the same task.

## Local development and checks

```sh
npm run check
npm run admin:dev
# Open http://127.0.0.1:4174/admin/
```

Local admin bypass requires both `ADMIN_LOCAL=true` and a loopback request hostname.
It cannot bypass production authentication. `admin:dev` explicitly uses a loopback
upstream because the production custom-domain setting otherwise rewrites that host.
For local model execution, set a separate development runner token in an ignored
`.dev.vars` file and the same `LAVIK_RUNNER_TOKEN` in the local worker environment;
point `LAVIK_ADMIN_URL` at the local port. Never set `ADMIN_LOCAL` in production.

```sh
npm run test:browser
npm run test:admin
```

The admin browser suite runs a real local Worker and SQLite Durable Object. Model
results in that suite are explicit fixtures. Separately, a live Azure audit of both
quick-start editions completed with real Docker receipts and independent findings;
it correctly remained **Changes requested**, not an automatic editorial pass.

## Storage, recovery and evolution

SQLite Durable Object `AdminStore` owns task records, drafts, feedback, events and
worker leases. Creation, claim, cancellation and feedback transitions are transactional.
Request identities prevent duplicate task creation. Runner callbacks need the current
lease token, and leases expire after two minutes without a heartbeat. A lost worker
becomes a failed task with saved work; it is not silently retried and charged again.
The runner checkpoints drafts and receipts before review and has a 50-minute task limit.
Retry currently begins a new attempt; it does not resume a provider conversation.

This is the v0.1 single-owner implementation. It uses Cloudflare's recommended
[SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)
and portable JSON contracts instead of provisioning PostgreSQL and a second
orchestration engine immediately. Queries bound dashboard payloads; stale worker
heartbeats are removed after 30 days, while task history remains. Durable Object
storage provides point-in-time recovery; a scheduled independent export/restore drill
remains future work. Do not delete its namespace when redeploying the public site.

Move large immutable artifacts into R2 and introduce indexed relational reporting
when volume requires it. Cloudflare Workflows or a persistent Linux service can
replace GitHub wake-ups without changing task identities, feedback or publication
contracts. See the [next increments](roadmap.md).
