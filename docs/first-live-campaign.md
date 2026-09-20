# First live campaign · September 20, 2026

The campaign `lavik-spdk-performance-and-capacity` completed with real Azure model
requests, local Lavik execution, independent source review, and automatic publication
to the content repository. Both editions passed with no remaining review findings.
Production deployment was not part of this run.

## Result and evidence

- [English article](../content/en/lavik-spdk-performance-and-capacity.json)
- [Simplified Chinese article](../content/zh-CN/lavik-spdk-performance-and-capacity.json)
- [English review](../evidence/reviews/en-lavik-spdk-performance-and-capacity.json)
- [Chinese review](../evidence/reviews/zh-CN-lavik-spdk-performance-and-capacity.json)
- [English execution receipt](../evidence/runs/lavik-spdk-performance-and-capacity/en-basic-commands.json)
- [Chinese execution receipt](../evidence/runs/lavik-spdk-performance-and-capacity/zh-CN-basic-commands.json)

Preview after `npm run dev`:

- `/en/blog/lavik-spdk-performance-and-capacity/`
- `/zh-CN/blog/lavik-spdk-performance-and-capacity/`

The writer used `gpt-6-astra` with `xhigh` reasoning; the reviewer used the same
deployment with `high` reasoning in a fresh context. The English reviewer actually
read six supporting sources; the Chinese reviewer read eight. Using the same model
for both roles retains shared model limitations.

Both editions executed the registered basic-command recipe against the pinned
Linux ARM64 minimal `0.1.0-beta.1` binary. PING, SET, GET, HSET, HGET and the graceful
restart check passed. These receipts establish functional behavior in that environment;
the SPDK performance figures come from the September 18 upstream report and CSV.

## Issues found and fixed during the pilot

1. A review-provider failure previously discarded completed writing. Drafts and
   receipts now checkpoint before review, including the final permitted writing
   attempt. The run demonstrated resuming review without rewriting.
2. Supplying every registered claim caused review of unrelated historical evidence.
   Reviewer context now contains the article's referenced claims and source catalog,
   including implicit dependencies of claim and calculator blocks.
3. Individual source reads exhausted the eight-turn limit. Both roles now read
   source batches, preserving turns for verification, arithmetic and final output.
4. Receipts alone did not expose the canonical harness or rendered calculator to
   the reviewer. Both roles now receive the block definitions, startup script,
   harness and expected hashes. Published agent reviews also bind the renderer and
   calculator hash; changes invalidate those reviews.
5. The reviewer required a clearer cost boundary. The English revision identifies
   the 84.55% saving as a modeled subtotal and names the unpriced components.
   Writing failures also now preserve editorial feedback across retries.

An earlier campaign, `spdk-performance-and-capacity-2026-09-20`, encountered a
connection failure and the unavailable `gpt-5-sol` reviewer deployment. Its completed
English draft predated the checkpoint fix and was lost. It produced no publication.
The owner selected `gpt-6-astra` for review before the successful campaign began.

## Observed model usage

The final successful invocations were:

| Edition | Role     | Requests | Input tokens | Output tokens |
| ------- | -------- | -------: | -----------: | ------------: |
| English | Writer   |        4 |      209,889 |         5,502 |
| English | Reviewer |        5 |      268,046 |         1,859 |
| Chinese | Writer   |        4 |      235,761 |         6,436 |
| Chinese | Reviewer |        4 |      228,791 |         1,565 |

The entire successful campaign ID, including failed requests and earlier revisions,
recorded 45 requests, 1,841,721 input tokens and 23,825 output tokens. Of those input
tokens, 945,071 were reported as cached. These are provider-reported usage counts,
not an Azure invoice estimate; repeated context and reasoning are included. They
exclude the earlier abandoned campaign. Full local events are in
`.runs/lavik-spdk-performance-and-capacity/events.jsonl` and are ignored by Git.

The campaign ran from 09:28:18 to 09:47:59 UTC, including debugging and resume gaps.
This is one integration trial, not a measurement of steady-state production cost,
latency or autonomous success rate.

## Validation

`npm run check` passed: TypeScript, 19 tests, checks for all 18 content editions,
11 pinned sources, and the production static build. All four Chromium tests passed,
including current benchmark values, language switching, internal routes, mobile
layouts, calculator interactions and execution details.

Both generated articles also passed direct desktop/mobile browser inspection:
all twelve benchmark figures, the execution record, calculator changes and absence
of horizontal overflow or browser errors were checked. Screenshots are saved in
`.cache/screenshots/campaign-*-desktop.png` and `campaign-*-mobile.png`.

The [Cloudflare website deployment](deployment.md) was completed afterward.
Recurring campaigns, the private operations console and external social publishing
remain subsequent increments.
