# Local publishing and weekly marketing reporting

The owner authorized a bilingual blog every two days and Cloudflare-based channel
reporting on September 26, 2026. This supersedes the previous default of no
background scheduling. Hosted Admin and Azure/API-backed writers remain disabled.

## Schedule and controls

The Mac's `dev.lavik.marketing` launch agent checks daily at 09:00 local time and
at login/load. `policies/marketing-schedule.json` specifies the two-day cadence.
The persisted next date is advanced by two calendar days, so it does not restart
at the beginning of a month like a cron `*/2` expression. Missed dates produce
at most one new task on the next check, not a burst of backlogged posts.

The Mac must be awake and connected, with Docker Desktop running. A pushed commit
can finish GitHub/Cloudflare deployment while the laptop sleeps. Publication is
confirmed on the next successful reconciliation. Subscription limits and review
failures can delay a post; accuracy takes precedence over filling a date.

```sh
npm run marketing:status
node --import tsx scripts/marketing.ts check
npm run marketing:tick
node --import tsx scripts/marketing.ts pause
node --import tsx scripts/marketing.ts resume
node --import tsx scripts/marketing.ts recover
node --import tsx scripts/marketing.ts run-now
npm run marketing:report
```

`pause` stops scheduled blog generation; reports remain available. `run-now` is
an explicit manual run and cannot create a duplicate job for the same date.
Install/reinstall the per-user launch agent with:

```sh
node --import tsx scripts/install-marketing.ts
```

Private queue state, attempts, receipts, checkouts, and logs are in
`.runs/local/marketing/`. There is one coordinator lock. Do not delete task attempt
directories to obtain more model calls. A stopped writer becomes `needs_attention`
and retains its draft and logs. Inspect the reason and fix the underlying problem;
subsequent scheduled dates may select another article. A committed article awaiting
deployment is reconciled before generating a new one, without calling a writer.

A coordinator crash leaves its lock closed. Child process groups are recorded
before they may execute and stop if their coordinator dies. Inspect the saved
owner/child identities and logs, then use `recover`; it refuses to unlock while
the old coordinator or any recorded child group is alive. Recovery never deletes
task attempts. Scheduled checkouts install dependencies from their own lockfile
with `npm ci --include=dev` and verify local tool resolution before verification
or model execution.

## Publication contract

Each task uses an isolated checkout of `origin/main`, the existing pinned sources,
and a fresh Docker execution of the registered basic command example. A local
ChatGPT-authenticated Codex writer returns both languages. A separate fresh reviewer
checks both. One correction pair is permitted: two writer and two reviewer attempts
at most, including failures. Shell and web tools are disabled inside those model
sessions; the trusted coordinator runs the registered verifier. Arbitrary
model-generated shell commands are not executed.

The existing content/publication gate binds the exact articles, evidence, policy,
and renderer. The publisher stages only the new article and its evidence, runs
repository checks, commits both languages, pushes to main without force, and waits
for CI. Published means the live publication manifest and both page content hashes
match. A non-fast-forward push is preserved for reconciliation; it never overwrites
another contributor's work. New source snapshots or arbitrary examples require a
separate reviewed repository change before a scheduled writer can use them.

There are no Azure/API key fallbacks. Polling, generating artwork/metadata, pushing,
reporting, and indexing notifications use ordinary code. The initial topic rotation
is an editorial prompt, not permission to repeat old articles. The reviewer receives
existing article titles/summaries and must reject weak repetition or unsupported
claims. No model can guarantee a novel, accurate article on every scheduled date.

## Channel attribution

Every new marketing link should include `utm_source`, `utm_medium`, and
`utm_campaign`. Generate one with:

```sh
npm run marketing:link -- /en/blog/why-lavik-separates-index-from-values/ x why-lavik-separates-index-from-values
npm run marketing:link -- /zh-CN/blog/why-lavik-separates-index-from-values/ wechat why-lavik-separates-index-from-values
```

Supported campaign sources are `x`, `reddit`, `medium`, `wechat`, `rednote`, `github`,
`discord`, `slack`, and `newsletter`. Campaign IDs must be existing blog article
IDs. Unknown campaign values become `unregistered`; arbitrary values are not
stored. `/campaign-links.json` supplies current links
for every blog edition. Canonical metadata always points to the clean article URL.
Use the tagged URL in WeChat QR codes too. Do not put names, email addresses, access
tokens, or other personal information in campaign parameters.

Attribution uses campaign tags first, then recognized referrer domains, then
`direct / unknown`. Unknown campaign sources share an `other_campaign` bucket.
Unknown external hosts share an `other_referral` bucket; their names are not stored.
An untagged app, pasted link, or stripped referrer cannot be distinguished reliably
from typed/bookmarked access. Existing X posts retain their published URLs; the
tracker can recognize an X referrer, but cannot reconstruct missing historical
campaign information. Other platforms have no automatic posting adapter enabled by
this pipeline; use generated tagged links in authorized channel publications.

The first-party tracker records aggregate hourly counts in a separate Cloudflare
SQLite Durable Object. It does not invoke a model and does not activate Admin.
The database holds source, medium, campaign, public page path, event, and count;
it does not store visitor IDs, IP addresses, fingerprints, or full URL queries.
Network addresses are processed transiently by Cloudflare's rate limiter.
Browser-tab sessionStorage preserves attribution and one-time action flags.
Do Not Track, Global Privacy Control, and the site's opt-out preference suppress
collection. The public privacy page describes the 180-day window and daily cleanup.

Metrics:

- Visits: browser-tab visits, reset after 30 minutes of inactivity or a changed
  explicit campaign. These are not unique people or cross-device sessions.
- Engaged: a visit with at least 20 seconds of visible page time.
- Install: a visit reaching a supported installation guide.
- Download: a visit clicking a release artifact or Docker image link, not a proven
  download completion or successful software installation.
- GitHub/community: visits clicking those destinations.

Action flags prevent repeated clicks inflating the same visit's count, but one
visit may perform several actions. Do not sum actions into a unique-conversion
count. Events are counted when they happen; a visit spanning week boundaries can
produce an action in a different report period. Script blocking and stripped tags
reduce coverage. Browser-tab state can be copied when duplicating tabs; these
metrics are directional and should not be labeled audited visitor counts.

## Weekly report

The first check in a new week generates a private report for the previous completed
Monday–Monday UTC week. Output lives in `.runs/local/marketing/reports/YYYY-MM-DD/`:
`report.html`, `report.md`, `report.csv`, and `report.json`. Open the HTML locally;
the CSV breaks down platform, campaign, page, and event. The Markdown also lists
pipeline results and exceptions. Reports compare with the previous saved week,
show the direct/unknown share, and avoid recommending effort changes from tiny
samples. The 30-visit guardrail is not a statistical significance test. Explicit
`diagnostic` smoke-test events are excluded from channel totals and remain labeled
in the raw CSV. Weekly files are retained locally for comparison.
No traffic history exists before collection is deployed.

The report endpoint requires a dedicated bearer token stored only in Cloudflare
as `ANALYTICS_REPORT_TOKEN` and locally in ignored
`.secrets/marketing/report-token` with restricted permissions. Do not put this token
in public site code, GitHub content, model prompts, or shared reports. No email or
Slack report delivery is configured.

Compare visits with installation-guide visits, engaged reading, and download intent.
Use multiple weeks before reallocating effort when counts are small. Financial ROI
also needs actual channel spend and owner time, which this tracker does not invent.
Google Search Console and Bing Webmaster Tools add their respective search/indexing
and AI visibility reports; they do not replace cross-channel website attribution.

## Discovery and regression checks

`npm run build` checks all sitemap HTML for descriptions, canonicals, matching
language destinations, structured data, previews, and internal links. It generates
`llms.txt`, RSS feeds, preview PNGs, a public IndexNow key, campaign links, and a
semantic discovery manifest. Empty blog-topic archives remain available to readers
but are noindex and excluded from the sitemap.

Deployment captures the previous discovery manifest. A required live check then
matches the deployed revision, every sitemap page's semantic content, and six
discovery assets to the built artifact; a mismatch fails deployment verification.
IndexNow runs separately only after that check and the public key are live. Changed and removed canonical URLs
are submitted. A failed notification is recorded as a warning and an Actions
artifact, not described as successful indexing. Retry notifications with the same
build and previous manifest; this makes no model calls. IndexNow can improve change
discovery for participating engines; it does not guarantee indexing or AI citations.
`llms.txt` is maintained for agent convenience and is not a Google ranking mechanism.
