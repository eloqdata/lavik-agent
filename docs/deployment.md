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

## Admin deployment record

The admin Worker and SQLite Durable Object were deployed on September 20, 2026
at 14:06 UTC, from commit `dbda42e`. Its first Worker version was
`4911a075-ab52-459d-881b-18ed7f34cb64`.

[Verification and deployment](https://github.com/eloqdata/lavik-agent/actions/runs/35515213885)
passed 25 automated tests, six browser checks and real x86 Linux command verification.
The initial deployment needed the account's Workers subdomain initialized; that
prerequisite is now configured. `workers_dev=false` keeps this application on its
custom domain.

The shared runner credential and Azure key were configured with the owner's explicit
authorization. GitHub variables match the local settings: `gpt-6-astra` for both
roles, writer reasoning `xhigh`, reviewer reasoning `high`. The hosted worker is
enabled, and its [first production check](https://github.com/eloqdata/lavik-agent/actions/runs/35515536998)
successfully recorded a heartbeat and skipped execution for an empty queue.

Production checks confirmed public English/Chinese pages and documentation still
return 200, the root redirects correctly, and missing pages return 404.

Cloudflare Access sign-in was configured and verified on September 20, 2026.
The deployed application matches the private paths and sign-in policy documented
in [admin.md](admin.md). Account-specific identifiers remain in private configuration.

Cloudflare API read-back confirmed the exact paths, provider and owner policy.
Anonymous admin requests redirect to Access, and a real browser loaded the Lavik
Admin email/code form. Public English/Chinese pages and documentation return 200.
The runner API rejects anonymous requests and accepts its existing credential,
independently of Access. Entering the owner's emailed PIN remains a user action;
this verification did not create an authenticated owner session. Setup instructions
are in [admin.md](admin.md).

Cloudflare API confirmation and production browser output are retained locally in
`.cache/cloudflare-deployment.json` and `.cache/production-browser-tests.log`.
