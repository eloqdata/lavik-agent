# Lavik Agent · 0.1.0

The bilingual website and evidence-driven content worker for [Lavik](https://github.com/eloqdata/lavik), targeting **lavik.dev**.

Accuracy is the first priority. The writer can inspect pinned product sources, execute registered examples against a real Lavik binary, reason about cost scenarios, receive an independent review, revise, and publish both language editions when checks pass. No per-article human approval is required by the default operating policy.

## Run the website

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open `http://localhost:3000/en/` or `http://localhost:3000/zh-CN/`. The site includes versioned documentation, release notes, benchmarks, use cases, FAQ, a journal, and an interactive cost model.

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

The browser checks require a completed build (`npm run check` includes it). Production output is in `apps/web/out`. The public site has no model or Docker runtime dependency.

## Verify the examples with real Lavik

Requires Docker with a Linux 6.1+ host/VM, io_uring enabled, and a compatible native x86_64 or ARM64 CPU. Docker Desktop on the development machine was used for the committed ARM64 execution record.

```sh
npm run verify:prepare
npm run verify:examples
npm run content:check
```

Preparation downloads the exact release archive, checks its pinned SHA-256, and builds a disposable Linux image. Execution verifies package version, binary version, source commit, startup, every displayed client command and output, and a graceful shutdown/restart. Evidence is saved under `evidence/verification`.

The documentation family is **0.1.0**. Its precise upstream release is **v0.1.0-beta.1**, commit `3955b98d43b312324aa8d52775df52cfb111c0d0`. Do not silently substitute `main` or `nightly`. The homepage and benchmark page use the September 18 SPDK report for that beta release, with peer controls reused from an earlier sweep. The journal's September 6 analysis retains its explicitly historical io_uring results and sources.

Tests use a disposable file on container temporary storage. They establish functional behavior for the recorded environment, not NVMe throughput, power-loss durability, replication availability, or an application SLA. The harness needs io_uring, which Docker's default seccomp profile blocks. It runs repository-owned code with that profile disabled, but with no network, host filesystem mounts, devices, capabilities, or secrets, as an unprivileged user, and with resource/time limits. **It is not an arbitrary-code sandbox.** New recipes are reviewed code changes.

## Assign a writing task

```sh
cp .env.example .env
# Set OPENAI_API_KEY, LAVIK_WRITER_MODEL, and LAVIK_REVIEWER_MODEL in .env.
npm run agent:write -- nvme-capacity-guide "Explain when developers should evaluate NVMe-backed storage. Include a verified command example and a calculated cost scenario."
```

The command generates English and Simplified Chinese editions, runs command recipes, reviews each edition independently, and allows two revision attempts after the initial draft. Passing campaigns publish automatically to `content/en` and `content/zh-CN`. The first autonomous publishing workflow targets blog articles; source-audited reference documentation changes remain ordinary repository changes.

The [first live Azure campaign](docs/first-live-campaign.md) completed this path with `gpt-6-astra` writing and reviewing both editions. Its report includes published artifacts, execution evidence, integration fixes and observed token usage.

Use `--draft-only` to stop at a reviewed campaign, or `npm run agent:publish -- CAMPAIGN_ID` to publish it later. Re-running the same ID and brief resumes completed work when evidence, policy, and runtime identity are unchanged. Each completed draft and its execution receipts are saved before review: a failed review request can resume without another writing attempt. State and append-only events live in `.runs/CAMPAIGN_ID`, including source reads, provider failures, and reported token usage. Interrupted writing itself is not resumed mid-request. A failed/unavailable verifier cannot count as a pass. Provider calls have turn, output-token, and wall-time limits; configure account spend limits separately.

The writer has read-only source tools, a numeric cost calculator, and a tool selecting audited execution recipes. It has no host shell, direct filesystem access, repository token, or social credentials. Review runs in a fresh context containing the article's referenced claims and source catalog. Its source tool reads batches, including dependencies of claim and calculator blocks; actual source reads are required before publication. Writer and reviewer may use the same deployment; this gives a separate review process but retains the model's shared blind spots. The separate publisher checks the exact reviewed content and evidence before writing. Filesystem state is appropriate for this initial single-host worker; it is not a distributed transaction system.

### Azure OpenAI and reasoning effort

The runtime supports Azure's OpenAI-compatible v1 Responses API. Set `OPENAI_BASE_URL` to the API base ending in `/openai/v1/`; the SDK appends `responses`. An `api-version` parameter is not needed for v1. Set `OPENAI_API_KEY` to your Azure resource key. Both model settings must contain **Azure deployment names**. For a GPT-6 Astra deployment named `gpt-6-astra`, use:

```dotenv
OPENAI_API_KEY=your-azure-resource-key
OPENAI_BASE_URL=https://YOUR-RESOURCE.services.ai.azure.com/openai/v1/
LAVIK_WRITER_MODEL=gpt-6-astra
LAVIK_REVIEWER_MODEL=gpt-6-astra
LAVIK_WRITER_REASONING_EFFORT=xhigh
LAVIK_REVIEWER_REASONING_EFFORT=xhigh
LAVIK_WRITER_MAX_TOKENS=32000
LAVIK_REVIEWER_MAX_TOKENS=32000
LAVIK_AGENT_TIMEOUT_MS=900000
```

The effort settings map to `modelSettings.reasoning.effort` for each agent, sent as `reasoning.effort` in the Responses request. GPT-6 Astra supports `low`, `medium`, `high`, `xhigh`, and `max`; Azure availability and supported parameters depend on your deployment. The token limits above are starting budgets per model request, including reasoning and visible output. The timeout applies to each complete writer/reviewer invocation, including tool calls. These budgets allow more room for `xhigh`; they do not guarantee completion. The GitHub campaign job still has an overall 40-minute limit.

Blank optional settings preserve the original defaults: OpenAI's public endpoint, API-default reasoning, writer/reviewer output caps of 5,000/2,500 tokens, and a 240-second invocation timeout. A changed endpoint, model, effort, or budget changes the runtime identity, so an existing campaign must use a new ID. Credential rotation alone does not change that identity.

OpenAI trace export is disabled for custom endpoints, including Azure; local campaign events and verification evidence remain enabled. To use the GitHub campaign workflow, put the Azure key in the `OPENAI_API_KEY` repository secret and configure the other settings above as repository variables.

See [Azure v1 configuration](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle), [GPT-6 Astra reasoning options](https://developers.openai.com/api/docs/models/gpt-6-astra), and [reasoning token budgets](https://developers.openai.com/api/docs/guides/reasoning).

## Automatic deployment and task execution

`wrangler.jsonc` serves the Next.js static export using Cloudflare Workers Static Assets and declares `lavik.dev` as the Worker's custom domain. The root URL redirects to `/en/`; Chinese content is available at `/zh-CN/`. This first website needs no Next.js runtime adapter.

The site is live at [lavik.dev](https://lavik.dev). The owning Cloudflare account is pinned in the configuration. See the [deployment record](docs/deployment.md) for the deployed version and production checks.

For a local deployment, sign in with `npx wrangler login`, then run `npm run deploy`. Use the Cloudflare account that owns the active `lavik.dev` zone. Cloudflare manages the custom domain's DNS record and certificate through the [Workers custom domain configuration](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

For CI deployment, configure GitHub secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, then set repository variable `LAVIK_AUTO_DEPLOY=true`. The API token must permit Workers deployment and custom domain management for the target account and zone. Keep it in GitHub Secrets; browser login credentials remain local.

The CI workflow reruns real Linux verification, checks content, tests the application, builds the site, and tests it in Chromium before deployment. Model credentials are not needed for website CI. The separate **Write and publish a bilingual campaign** workflow accepts a brief and campaign ID, and additionally needs `OPENAI_API_KEY` plus the two model-name variables. It commits passing bilingual content and can deploy directly; it does not depend on a token-authored push triggering another workflow. Branch rules must permit the configured bot to write content, or that commit step will fail explicitly. Store `.runs` durably for a future hosted worker; GitHub run artifacts are retained for 30 days and workflow reruns do not automatically restore them.

## Evidence and economics

Human-maintained reports are authoritative for their recorded measurements. Website charts calculate peaks from preserved CSV data. Generated statements can also be **derived**: a 20:1 DRAM/SSD unit-price assumption implies 95% less cost for the value-capacity component. The public calculator exposes index-memory and shared-cost assumptions so this does not become an unqualified deployment or SLA promise. The existing report's separate historical Azure cost estimates are also shown with their date and service boundaries.

The release lock, source hashes, claim registry, article revisions, independent reviews, recipe hashes, actual transcripts, and verifier image identity form the publication evidence. Model input includes the block renderers, calculator code, startup script, harness and expected hashes. Agent reviews bind the renderer/calculator hash as well as the article, so changes to rendered meaning invalidate their approval. Schemas and pattern checks cannot establish all semantic truth; independent source review, maintained evaluation cases, and occasional human audits remain necessary.

## Repository map

| Path                    | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| `apps/web`              | English/Chinese Next.js site and static export                   |
| `content`               | Structured articles, claims, release/artifact lock               |
| `packages/content`      | Schemas, sources, benchmark calculations, publication checks     |
| `packages/verification` | Real Linux command execution                                     |
| `packages/agents`       | Writer/reviewer runtime, resumable workflow, publication service |
| `verification`          | Audited startup script, recipes, container harness               |
| `evidence`              | Pinned source snapshots, independent reviews, execution records  |
| `policies`              | Operating rules and versioned writer/reviewer instructions       |
| `docs`                  | Architecture, operating policy, remaining deployment work        |

See [architecture](docs/architecture.md) and [operating policy](docs/operating-policy.md). The private operations console, managed campaign state, schedules, analytics ingestion, and external social connectors are subsequent increments, described there rather than represented as working integrations.

## License

Apache-2.0. Preserved upstream materials retain their notices; see [NOTICE](NOTICE).
