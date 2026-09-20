# Private agent console

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

**Review passed means a private draft passed its checks.** Admin drafts are not yet
connected to website publication. The existing CLI campaign publisher still publishes
paired blog campaigns under its configured automatic policy. Connecting admin drafts
to publication is the next increment, without adding mandatory per-post approval.

## Cloudflare Access setup

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

The **Process private admin tasks** GitHub Actions workflow checks for queued work
on a five-minute cron schedule. GitHub schedules are best effort, so this is not a
five-minute start-time guarantee. **Run workflow** can request an earlier check.
An idle check records a heartbeat and skips Docker preparation and model calls.

Configure the following repository secrets and variables before enabling it:

| GitHub setting                                                                             | Purpose                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Secret `LAVIK_RUNNER_TOKEN`                                                                | Same value as the Worker's `RUNNER_TOKEN`               |
| Secret `OPENAI_API_KEY`                                                                    | Azure/OpenAI credential used only by the execution step |
| Variables `OPENAI_BASE_URL`, `LAVIK_WRITER_MODEL`, `LAVIK_REVIEWER_MODEL`                  | Explicit endpoint and deployment names                  |
| Variables `LAVIK_WRITER_REASONING_EFFORT`, `LAVIK_REVIEWER_REASONING_EFFORT`               | Explicit reasoning effort for each role                 |
| Variables `LAVIK_WRITER_MAX_TOKENS`, `LAVIK_REVIEWER_MAX_TOKENS`, `LAVIK_AGENT_TIMEOUT_MS` | Invocation budgets                                      |
| Variable `LAVIK_ADMIN_WORKER_ENABLED=true`                                                 | Enable scheduled and manually dispatched execution      |

The workflow has read-only repository permissions and does not publish task briefs,
drafts, feedback or transcripts as GitHub artifacts. The repository is public;
workflow logs report only operational status and task IDs. Detailed model events
and results go to authenticated Cloudflare storage. Anyone able to change trusted
workflows can potentially use their credentials, so repository write access matters.

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
