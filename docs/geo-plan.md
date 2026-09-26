# Lavik.dev GEO plan

Prepared September 26, 2026. Planning baseline: repository commit
`e20308b4a303e98b6f0558eebe311911b7664261` and a public-site inspection.
This is the original audit and rollout plan. The September 26 implementation is
described in [marketing operations](marketing-operations.md): discovery metadata,
static benchmark data, llms.txt/RSS, channel attribution, weekly reporting, and the
bounded local blog pipeline. Index growth and channel effectiveness still require
real observations over time; shipping the instrumentation does not establish them.

The objective is to make Lavik discoverable and accurately cited when developers
and infrastructure decision-makers investigate Redis alternatives, growing datasets,
NVMe SSD storage, performance, and capacity cost. Success means more qualified
evaluations and correct explanations of Lavik, measured alongside citations.

Google's current guidance emphasizes useful original information and ordinary
search fundamentals. Special AI markup and `llms.txt` are not prerequisites for
Google's AI search features. Treat the work below as measurable improvements to
the site and its evidence, without promising rankings or recommendations.
[Google guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)

**Observed starting point**

| Area                         | Finding                                                                                                         | Implication                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Rendering                    | Next.js static export; sampled public pages returned HTTP 200 with headings and content in HTML                 | Keep the existing architecture                                                      |
| Discovery                    | Live robots.txt allows crawling and references the sitemap; sitemap has 564 unique URLs                         | A discovery foundation already exists                                               |
| Languages                    | Sampled pages have EN/zh-CN alternate links and canonical URLs                                                  | Preserve bilingual coverage and validate matching canonical destinations            |
| Metadata                     | Benchmark, cost, docs alias, and sampled EN/Chinese GET command pages lack descriptions                         | Fill gaps with useful page-specific descriptions                                    |
| Structured data and previews | No JSON-LD or Open Graph/X card metadata in sampled pages; no implementation found in the inspected source      | Add shared metadata and accurate structured data                                    |
| Docs alias                   | `/en/docs/` canonicalizes to `/en/docs/0.1.0/`, but its language alternates point to unversioned aliases        | Normalize the alias and language-link policy                                        |
| Freshness                    | Only 34 sitemap entries include lastmod                                                                         | Add truthful dates where content history supports them                              |
| Performance presentation     | Chart renders GET initially; SET is exposed through client-side interaction                                     | Add a visible HTML table containing both workloads                                  |
| Editorial evidence           | Versioned docs, tested examples, source-linked blogs, benchmark conditions, and a cost calculator already exist | Improve and connect these assets before commissioning many more articles            |
| Author identity              | Blog schema lacks author and original publication-date fields                                                   | Add truthful attribution, distinct publication/update dates, and maintainer context |
| Measurement                  | No analytics or IndexNow implementation found in inspected source                                               | Establish a baseline and reporting loop                                             |

The audit sampled eight HTML URLs, robots.txt, and the sitemap; it was not a
complete crawl of all 564 pages. Search surfaced the homepage and download page,
which demonstrates some discoverability, not complete index coverage. Cloudflare
dashboard policies, verified crawler traffic, Search Console, Bing Webmaster
Tools, and account-level analytics were not inspected. Cloudflare may inject
analytics independently of repository code.

**Delivery order**

| Phase                        | Suggested timing                               | Deliverable                                                                       | Completion criterion                                                                                                                             |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1: Discovery and baseline    | Week 1; roughly 2–3 engineering days           | Crawl audit, metadata, canonical fixes, static benchmark table, measurement setup | All intended indexable routes pass automated HTML checks; account-level crawler checks have recorded results or explicit unresolved dependencies |
| 2: Adoption and evidence     | Week 2; roughly 3–5 editorial/engineering days | Improved benchmark, cost, compatibility, migration, and product identity pages    | Both languages published through existing review gates; claims and examples trace to current evidence                                            |
| 3: Publishing integration    | Week 3; roughly 2–3 engineering days           | Deployment-triggered discovery updates and a bounded local monitoring workflow    | A reviewed update deploys, passes live checks, and records discovery notifications without duplicate publication                                 |
| 4: Measurement and iteration | Week 4, then monthly                           | First visibility report and prioritized content changes                           | Report separates citations, factual accuracy, referrals, and adoption proxies                                                                    |

These estimates exclude search-engine recrawl delays, access setup, and additional
hardware benchmarking. Phases may overlap after the baseline is captured.

**Phase 1: Make the existing site consistently discoverable**

1. Verify the domain in Google Search Console and Bing Webmaster Tools if it is
   not already verified. Submit the existing sitemap and inspect the homepage,
   benchmark, cost, download, docs, and representative articles. Record actual
   index status; a sitemap submission does not establish indexing.
2. Inspect Cloudflare AI Crawl Control, WAF challenges, and verified bot traffic.
   Ensure public pages can be retrieved by Googlebot, Bingbot, OAI-SearchBot,
   Claude-SearchBot, and PerplexityBot, plus legitimate user-triggered fetchers.
   Preserve admin protections. Verify crawler identity through supported bot
   signals or published verification methods; a spoofed User-Agent request alone
   cannot establish real crawler access.
3. Keep search access and model-training policy distinct. OpenAI documents
   OAI-SearchBot as the search crawler and GPTBot as the training crawler, with
   independent controls. Do not change training preferences simply to pursue
   search visibility.
   [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots),
   [Cloudflare bot reference](https://developers.cloudflare.com/ai-crawl-control/reference/bots/)
4. Introduce a shared route metadata builder. Supply specific localized titles
   and descriptions for every intended indexable route. Add Open Graph and X
   cards, reusing blog artwork with suitable PNG/JPEG previews. Preview metadata
   primarily improves sharing presentation; it is not a guaranteed citation signal.
5. Define canonical URLs centrally. Redirect unversioned docs aliases to the
   selected version with a redirect policy compatible with future release changes;
   keep archived versions accessible. Point language alternates to the matching
   canonical editions. Validate slash, host, redirect, and missing-route behavior.
6. Add modest JSON-LD generated from the same visible data: WebSite, the actual
   publishing organization, SoftwareApplication/SoftwareSourceCode for Lavik,
   BlogPosting for articles, and BreadcrumbList where appropriate. Include
   repository, license, release, language, image, and truthful author/date fields.
   Do not invent ratings, customer counts, or authors. This aids machine-readable
   consistency; schema is not a special GEO eligibility requirement.
7. Add meaningful lastmod values derived from substantive content changes, not
   build time. Check sitemap URLs, language pairs, internal links, private routes,
   and empty topic archives. Keep empty archives out of indexing until useful.
8. Add a visible HTML benchmark table with GET/SET QPS and p99 together. Keep
   the interactive chart as a complementary view. Keep cost formulas and a
   default worked example readable before JavaScript executes.

Acceptance checks should cover all generated public routes for metadata and link
consistency, plus representative live pages after deployment. Include real 404
behavior, no accidental noindex or Cloudflare challenge, JSON-LD validity,
mobile readability, and content availability with JavaScript disabled. Schema
values must agree with visible text. A full performance audit can identify
specific mobile or Core Web Vitals issues; no such failure was established here.

**Phase 2: Give adoption questions authoritative answers**

Use one principal page for each intent, supported by existing technical articles.
Avoid creating many near-duplicate landing pages for keyword variants.

| User question                                                | Primary destination                                                       | Improvement                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| What is Lavik, and why consider it?                          | Product overview linked from homepage and docs                            | Concise definition, beta status, Apache 2.0, DRAM index/NVMe SSD values, supported interfaces, maintainers, and where to begin    |
| How can I reduce the memory cost of a growing Redis dataset? | Existing `/en/cost/` and Chinese equivalent                               | Explain the 20× capacity-price relationship; add worked scenarios and dated price sources alongside the calculator                |
| Is Lavik faster than Redis or Valkey?                        | Existing benchmark page                                                   | Full static comparison, methodology, source data, versions, configurations, and historical/current separation                     |
| Can my Redis application use Lavik?                          | Existing compatibility overview and client library docs                   | Clear tested/supported/limited statuses, version scope, operational differences, and links to individual commands                 |
| How do I migrate and evaluate risk?                          | Existing Redis/Redis Cluster migration guides                             | Verified procedure, validation, rollback, client behavior, and links to quick start and cluster management                        |
| Is SSD-backed storage suitable for my workload?              | Existing use cases plus one substantive architecture comparison if needed | Explain memory index/value separation, access patterns, latency and capacity tradeoffs; verify each competitor-specific statement |

Keep the strong value proposition: **Faster than Redis in the published SPDK
benchmark. 20× lower value-capacity cost at a 20:1 DRAM/NVMe SSD price ratio.**
Benchmark observations and capacity arithmetic have separate evidence. Keep the
supporting conditions near the claim so a reader or assistant can quote both
accurately. The 20× ratio is not a measured whole-deployment saving or a proof of
equal application SLA.

The September 18 table already supports a concrete comparison: Lavik peak GET
1,012,180 QPS / p99 3.599 ms and SET 930,465 / 4.799 ms; Redis 976,801 / 4.671 ms
and 910,426 / 4.831 ms; Valkey 965,697 / 4.543 ms and 802,519 / 4.383 ms. Preserve
the report's different peak concurrency settings, reused controls, persistence
configuration, and limited run duration. Historical articles retain their dates
and measurements and link to the current benchmark.

Improve each priority page with a useful opening answer, meaningful headings,
anchored sections, version/date context, tables where comparisons help, related
questions, and the next evaluation step. This is a usability choice, not a claim
that AI systems require a fixed answer length or artificial text chunks.

Add real maintainer/project attribution and an About page; link the official
repository and community accounts consistently. Preserve EN/zh-CN parity and
natural technical terminology. Documentation remains user-facing: internal
verification receipts stay internal, while practical requirements, compatibility
limits, and version context remain visible. Blogs and benchmarks retain their
appropriate public source links.

The highest-value subsequent research is original evidence: repeated benchmark
runs, larger-than-memory datasets, realistic value sizes and read/write mixes,
actual memory use, durability configurations, and workload-level tail latency.
Run on appropriate documented hardware; Docker functional tests do not establish
SPDK production performance. Publish these results only after measurement.

**Phase 3: Extend the local team economically**

Reuse the existing local workflow rather than restoring hosted Admin or introducing
an always-running model service. No Azure API key or paid API fallback is needed
for this plan.

`source change or measured gap → bounded local task → evidence and Docker checks
→ independent review → website publication → Cloudflare deployment → live checks
→ discovery notification → recorded result`

| Responsibility | Proposed behavior                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator    | Compare source/release changes and aggregate metrics with ordinary code; open a task only for a relevant gap                       |
| Writer         | Improve an existing authoritative page or produce a justified new article, with tested examples and matching translations          |
| Reviewer       | Check factual scope, claim evidence, runnable examples, visible text/metadata agreement, and release identity                      |
| Publisher      | Deploy the approved revision, verify live URLs, update feeds/sitemap, and notify supported search engines                          |
| Monitor        | Record crawl failures, broken links, stale evidence, observed citations, and attribution limits; produce one concise weekly report |

Add IndexNow notifications for changed or removed canonical URLs only after the
deployment is verified. Store the deployment/content identity and delivery state,
retry bounded failures, and report errors without republishing unchanged content.
IndexNow notifies participating engines; it does not guarantee indexing or submit
content to every AI assistant.
[IndexNow protocol](https://www.indexnow.org/documentation)

Add RSS/Atom for blogs and releases. Optionally generate `llms.txt` and versioned
Markdown exports from approved content for developer-agent convenience, with
canonical links and matching version information. Give these lower priority than
HTML, evidence, and measurement; do not treat them as a Google ranking mechanism.

Keep existing invocation/retry limits, independent reviews, pinned release data,
and deployment receipts. Polling, link checking, metadata generation, and publishing
unchanged approved copy need no model calls. Run a single bounded weekly planning
batch; preserve state on subscription limits. Local scheduling depends on the Mac
being awake and online. A monitoring role is a workflow responsibility, not an
additional continuously chatting agent.

Use reviewed excerpts and article-specific links on X. For future Medium or other
syndication, preserve attribution and use canonical-to-original support where
available. Encourage real evaluations, issue reports, and independent benchmarks.
Public technical discussion can strengthen evidence and awareness; repeated
promotional posts, manufactured endorsements, and private community conversations
do not substitute for accessible documentation. New channel publishing remains
subject to the established channel authorization and rules.

**Phase 4: Measure useful outcomes**

Establish a baseline before changes. Choose 20 adoption questions split between
developer evaluation and infrastructure/business concerns, with English and
Chinese variants. Suggested questions include “Redis alternative for datasets
larger than RAM,” “reduce Redis capacity cost,” “Lavik Redis compatibility,” and
“Lavik SPDK benchmark methodology.” Keep branded and unbranded queries separate.

Use a small rotating weekly sample and a fuller monthly comparison across the
available search-enabled ChatGPT, Claude, Perplexity, and Google experiences.
Record date, surface, language, exact prompt, search mode, cited URL, and whether
the answer describes cost, beta status, and compatibility correctly. Repeat a
subset to expose variability. These observations are a panel, not population-wide
market share. Use permitted product access/manual checks; paid evaluation APIs
are not a prerequisite and should not be silently introduced.

| Measure            | Source and interpretation                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Crawl/index health | Search Console, Bing Webmaster Tools, Cloudflare bot analytics; distinguish bot access from actual indexing        |
| AI visibility      | Google generative AI impressions where shown; Bing cited pages/citations; repeatable manual answer samples         |
| Citation accuracy  | Does the cited answer preserve version, scope, 20× capacity assumptions, and compatibility limits?                 |
| Qualified traffic  | Available AI referrers and visits reaching compatibility, installation, benchmark, or download pages               |
| Adoption proxies   | Download clicks, installation-guide engagement, and community/GitHub outbound clicks; none alone proves deployment |
| Operating cost     | Local runner usage, retries, corrections, and owner time per useful published update                               |

Google documents a generative AI performance report for AI Overviews and AI Mode;
low-volume sites may not see sufficient data. Bing reports citations across its
supported Microsoft/partner experiences. Neither should be presented as a complete
measure of all assistants.
[Google report](https://support.google.com/webmasters/answer/16984139),
[Bing report](https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/)

Initial controlled targets: every intended indexable page has suitable metadata;
all priority pages expose substantive answers in HTML; no unresolved broken
canonical/language links; every new performance claim has evidence; one weekly
report. Set traffic and citation growth targets after the first 30-day baseline,
then compare at 60 and 90 days. Referrers can be missing and search answers vary;
avoid attributing every traffic change to GEO work.

**First implementation batch**

Start with the shared metadata builder, canonical/language cleanup, visible
GET/SET table, preview images, basic accurate JSON-LD, and a generated-page audit.
Likely touch points are the locale layout, catch-all page metadata, sitemap,
benchmark component, content schema, and CI. Existing review hashes cover some of
these files: obtain the required independent review and refresh valid receipts
before publication; never bypass the content gate to ship SEO changes.

Account-dependent follow-up is limited to confirming Search Console/Bing access
and inspecting Cloudflare crawler policies and reports. Build and review the
repository changes independently of those account steps. The second batch should
improve the benchmark and cost pages, then connect compatibility and migration
answers. Expand content only where the baseline identifies a useful missing answer.
