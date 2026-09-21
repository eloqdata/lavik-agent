# Local architecture article batches

The September 21 series adds eight engineering topics in English and Chinese.
Each article records `sourceRevision`, and every cited paragraph must point to a
source at that exact Lavik commit. The blog template identifies engineering notes
separately from the versioned beta manual. The existing article schema, source
registry, review checks, deterministic publisher and GitHub deployment remain in
use.

The local writer receives the pinned primary documents and returns structured
drafts. These articles explain architecture without adding runnable snippets or
claiming new benchmark, failover or crash-test execution. Use the existing Docker
verification workflow if a later article adds commands; source review alone does
not verify a runnable example.

`scripts/review-blog-batch.ts` accepts a private task directory and a JSON file
containing `{ "articles": [...] }` with eight bilingual pairs. Save the current
manual publication receipt as `manual-before.json` in that directory before
making shared infrastructure changes, and the matching source registry as
`sources-before.json`. Run the reviewer with:

```sh
node --import tsx scripts/review-blog-batch.ts .runs/local/my-series drafts.json
```

The reviewer is a fresh ChatGPT-authenticated local Codex session. The launcher
excludes API credentials and never loads `.env`. Its existing per-task invocation
limits apply to writing and review together.

Adding sources changes the existing global knowledge fingerprint. The batch
therefore reviews all affected existing articles as well as all new editions. It
supplies their full cited primary sources, actual execution receipts where used,
renderers and publication code. It requires an individual passing verdict and
complete source coverage for every edition before publication.

For the manual, the batch uses an explicit incremental review: the previous
passing approval, complete old/current file hashes and every changed file go to
the reviewer. Unchanged command/client/use-case content retains its prior review;
deterministic execution-evidence checks still run. Previously bound files cannot
be removed. The new receipt records its previous bundle hash and reviewed changes
and binds the complete current file set. This avoids sending the unchanged user
manual to another model for each source-registry addition.

This incremental path allows only an explicit list of blog infrastructure files
to change and requires the source registry to grow without modifying old entries.
Changes to manual content, command/client fixtures, release locks or execution
evidence require the full manual review workflow.

After review, the script checks that all inputs remained unchanged. It validates
all eight publication candidates before writing, uses the existing publisher for
new bilingual articles and immutable publication manifests, refreshes the reviewed
existing article records, and writes the incremental manual receipt. Public batch
evidence records the reviewer, per-edition decisions, input hashes, publication
identities and manual review scope. Private prompts and events remain under
`.runs/local/`.

Run `npm run check`, public browser tests and the existing local Admin regression
suite, then commit and push. Production status requires a successful GitHub /
Cloudflare deployment and matching live article hashes. Hosted Admin stays off.
