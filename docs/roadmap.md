# Next increments

The website, real command verifier, bilingual blog campaign pipeline and private
four-role admin console are implemented. The console's Access application and
hosted runner require account configuration described in [admin.md](admin.md).

## 1. Close the documentation loop

Use the live quick-start review as the first revision task. Its actionable findings
cover release download/checksum instructions, fresh demonstration data, port 6379
ownership, Bash/runtime prerequisites and startup troubleshooting. Keep the pinned
0.1.0-beta.1 release identity. Re-run the commands and review each corrected edition.
Review calls must judge their supplied locale; the host coordinates bilingual coverage.

The website publication connection is implemented for blog posts and versioned
manual updates. It includes optimistic destination checks, immutable per-article
receipts, a versioned renderer, atomic bilingual Git commits, deployment checks,
and Published status with live URLs. Apply it to the documentation corrections
above and expand the audited command recipes when new guides require them.

Acceptance: assigning a task yields either a correctly published bilingual revision
or a precise persisted exception, with no routine human approval step.

## 2. Extend the publishing agent to platform adapters

Keep publication separate from writing. The publisher accepts a reviewed immutable
revision, destination account and configured rules. A channel editor adapts length,
format, language and community context; an independent check covers the adapted
copy before publication. The website remains the canonical source for full evidence.

Build a durable publication outbox with one action identity per destination,
account, content revision and intent. Record external post IDs, URLs, attempts and
delivery state. After ambiguous timeouts, reconcile with the platform before retrying.
A successful X post must not be repeated because a WeChat operation failed. Support
scheduled delivery, per-channel pacing, correction records and a pause switch.

| Destination           | Next work                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| lavik.dev             | Connected: automatic bilingual publication, deployment checks and live URLs                                                                      |
| X                     | Verify account/app posting access; implement publishing, read-back and metrics supported by that access                                          |
| Reddit                | Verify API access and each target community's rules; create useful context-specific posts and avoid repeated promotional submissions             |
| WeChat                | Check the official account's draft/publish capabilities and media handling; preserve Chinese typography                                          |
| Medium                | Provide a reviewed export/import handoff first unless the account has a supported integration                                                    |
| Rednote / Xiaohongshu | Verify supported account integrations; prepare reviewed Chinese copy and media, with an explicit handoff where direct publication is unavailable |

The external channels are planned integrations. Medium's own
[archived API documentation](https://github.com/Medium/medium-api-docs/blob/master/README.md)
states that the API is unsupported; do not promise a new generic API integration.
Account capabilities must be established for every platform before selecting a
delivery mechanism. Human handoff is an adapter limitation, not a new editorial
approval requirement for channels that support authorized automatic publication.

Acceptance: the console shows scheduled, delivered, failed and handoff-required
states, with actual destination links and independently retryable failures.

## 3. Keep content current automatically

Watch upstream release tags and changes to pinned source dependencies. Create
version-specific refresh tasks, preserve old documentation and generate release notes
from the actual changes. Refresh benchmark and cost evidence explicitly. A newer
README must not silently change a historical article's measurements.

Add a planner that produces a bounded weekly calendar based on product changes,
developer questions and gaps in the manual. Deduplicate topics and reuse verified
evidence. Set per-week model and publishing budgets before unattended scheduling.

## 4. Learn from outcomes and owner feedback

Track accuracy corrections, broken examples, review disagreement, time-to-publish,
model usage, owner time, qualified documentation visits and useful adoption signals.
Avoid optimizing for post volume or invented customer conversions. Compare topic
and channel performance using measurable outcomes and explicit attribution limits.

Turn recurring feedback into proposed policy changes and maintained evaluation cases.
Version prompts and models, test candidates against those cases, trial a limited
rollout and retain rollback. Task feedback currently guides revisions; it does not
silently rewrite system policies or grant new tools. Add automated private backups,
restore drills, failure notifications and persistent execution when scheduling or
volume justifies moving beyond the initial GitHub worker.
