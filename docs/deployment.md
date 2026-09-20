# lavik.dev deployment

The public website was deployed and verified on September 20, 2026.

| Item                            | Value                                       |
| ------------------------------- | ------------------------------------------- |
| Production URL                  | https://lavik.dev                           |
| English                         | https://lavik.dev/en/                       |
| Simplified Chinese              | https://lavik.dev/zh-CN/                    |
| Worker                          | `lavik-dev`                                 |
| Initial worker version          | `27c27012-71ba-44be-9468-61451f41df5f`      |
| Deployment type                 | Cloudflare Workers Static Assets            |
| Domain attachment               | Enabled custom domain in the owning account |
| Initial production verification | 2026-09-20 10:11 UTC                        |

`wrangler.jsonc` pins the owning account and domain. The Worker serves the static
export from `apps/web/out`. The admin increment adds a small authenticated Worker
and SQLite Durable Object binding `ADMIN_STORE`. Model credentials and Linux execution
remain on the separate runner. Configure Access and the runner credential using the
[admin deployment instructions](admin.md); private routes fail closed until configured.

The root URL returns an HTTP 302 redirect to `/en/`. The configuration preserves
trailing slashes and returns a real 404 for missing pages. English and Chinese
documentation, release notes, use cases, FAQ, benchmarks, calculator and blog
articles are available over HTTPS.

Validation completed:

- Content checks: 18 editions and 11 pinned sources.
- Production build and Wrangler deployment dry run.
- Four browser tests against Cloudflare's local runtime.
- Public HTTPS checks for the homepages, documentation, both generated blog
  editions, sitemap, robots.txt, root redirect and missing-page response.
- All four browser tests against the live domain, covering current benchmark
  values, language switching, actual command evidence, calculator interaction,
  internal links and mobile layouts.

Pushes to `main` automatically update production through the
[Verify content and website workflow](https://github.com/eloqdata/lavik-agent/actions/workflows/ci.yml).
Each deployment requires successful real Linux command verification, content checks,
application tests, a static build and Chromium browser tests. Pull requests verify
without deploying. A build superseded on `main` is skipped before publication.
CI saves its execution receipts as the `verification-evidence` artifact, preserving
the committed execution records used by reviewed articles.

GitHub stores the owning account ID in `CLOUDFLARE_ACCOUNT_ID` and the deployment
token in `CLOUDFLARE_LAVIK`. Both workflows also accept `CLOUDFLARE_API_TOKEN`, which
takes precedence if present. The repository variable `LAVIK_AUTO_DEPLOY=true`
enables deployment; setting it to `false` suspends deployment while retaining
verification. Workflow runs record the deployed Worker version.

For a manual redeploy, authenticate Wrangler with a login that has access to the account
specified in `wrangler.jsonc`, then run:

```sh
npm run deploy
```

The scheduled admin worker checks for accepted tasks; it does not plan new campaigns.
Recurring editorial planning and external social publishing remain separate increments.

Cloudflare API confirmation and production browser output are retained locally in
`.cache/cloudflare-deployment.json` and `.cache/production-browser-tests.log`.
