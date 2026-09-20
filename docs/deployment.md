# lavik.dev deployment

The public website was deployed and verified on September 20, 2026.

| Item                         | Value                                       |
| ---------------------------- | ------------------------------------------- |
| Production URL               | https://lavik.dev                           |
| English                      | https://lavik.dev/en/                       |
| Simplified Chinese           | https://lavik.dev/zh-CN/                    |
| Worker                       | `lavik-dev`                                 |
| Worker version               | `27c27012-71ba-44be-9468-61451f41df5f`      |
| Deployment type              | Cloudflare Workers Static Assets            |
| Domain attachment            | Enabled custom domain in the owning account |
| Last production verification | 2026-09-20 10:11 UTC                        |

`wrangler.jsonc` pins the owning account and domain. The Worker serves the static
export from `apps/web/out`. Its production bindings are empty; the marketing agent
and model credentials are not part of this website deployment.

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

To redeploy, authenticate Wrangler with a login that has access to the account
specified in `wrangler.jsonc`, then run:

```sh
npm run deploy
```

GitHub Actions deployment is defined in the repository but was not enabled by this
local deployment. It requires the configured Cloudflare repository secrets and
`LAVIK_AUTO_DEPLOY=true`. Recurring marketing tasks and external social publishing
remain separate increments.

Cloudflare API confirmation and production browser output are retained locally in
`.cache/cloudflare-deployment.json` and `.cache/production-browser-tests.log`.
