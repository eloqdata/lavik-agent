import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { AnalyticsStore } from "../packages/marketing/analytics";
import { PlatformAuth, digest } from "../packages/marketing/platform-auth";
import { PlacementStore } from "../packages/marketing/placements";
import { resolveVisit } from "../packages/marketing/attribution";
import {
  renderReport,
  summarizePlacements,
  csvCell,
} from "../packages/marketing/report";
import consoleWorker from "../apps/marketing/worker";
import siteWorker from "../apps/worker/index";
import type { Database } from "../packages/admin/store";

function fixture(legacy = false) {
  const sqlite = new DatabaseSync(":memory:");
  const db: Database = {
    sql: {
      exec: (query, ...bindings) => {
        const statement = sqlite.prepare(query);
        const rows = statement.columns().length
          ? statement.all(...bindings)
          : (statement.run(...bindings), []);
        return { toArray: () => rows } as never;
      },
    },
    transactionSync: (f) => {
      sqlite.exec("BEGIN");
      try {
        const r = f();
        sqlite.exec("COMMIT");
        return r;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  if (legacy) {
    sqlite.exec(
      "CREATE TABLE metrics (hour TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, path TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(hour,source,medium,campaign,path,event))",
    );
    sqlite
      .prepare("INSERT INTO metrics VALUES(?,?,?,?,?,?,?)")
      .run(
        "2026-09-26T00:00:00.000Z",
        "wechat",
        "social",
        "test",
        "/en/",
        "visit",
        7,
      );
  }
  const assets = {
    fetch: async (r: Request) =>
      Response.json(
        r.url.endsWith("campaign-links.json")
          ? {
              articles: [
                {
                  id: "test",
                  locale: "en",
                  canonical: "https://lavik.dev/en/blog/test/",
                  title: "Test",
                },
              ],
            }
          : {
              pages: {
                "https://lavik.dev/en/": "hash",
                "https://lavik.dev/en/blog/test/": "hash",
              },
            },
      ),
  };
  const store = new AnalyticsStore({ storage: db }, { ASSETS: assets });
  return { sqlite, db, store, assets };
}
const origin = "https://marketing.lavik.dev";
function request(
  endpoint: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
  csrf?: string,
) {
  return new Request(`${origin}/platform/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function activate(store: AnalyticsStore) {
  const activation = randomBytes(32).toString("hex");
  assert.equal(
    (
      await store.fetch(
        request("bootstrap", "POST", { activationHash: digest(activation) }),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await store.fetch(
        request("login", "POST", { username: "admin", password: "admin" }),
      )
    ).status,
    401,
  );
  const response = await store.fetch(
    request("login", "POST", {
      username: "admin",
      password: "admin",
      activation,
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { csrf: string };
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0];
  assert.match(
    response.headers.get("Set-Cookie")!,
    /HttpOnly; SameSite=Strict/,
  );
  assert.match(response.headers.get("Set-Cookie")!, /; Secure/);
  assert.equal(
    (await store.fetch(request("report", "GET", undefined, cookie))).status,
    403,
  );
  const changed = await store.fetch(
    request(
      "password",
      "POST",
      { currentPassword: "admin", newPassword: "a strong test password 2026!" },
      cookie,
      body.csrf,
    ),
  );
  assert.equal(changed.status, 200);
  return {
    cookie: changed.headers.get("Set-Cookie")!.split(";")[0],
    ...((await changed.json()) as { csrf: string; recoveryKey: string }),
    activation,
  };
}
test("placement migration preserves historical counts and is idempotent", () => {
  const f = fixture(true);
  try {
    new AnalyticsStore({ storage: f.db }, { ASSETS: f.assets });
    assert.deepEqual(
      { ...f.sqlite.prepare("SELECT placement,count FROM metrics").get() },
      { placement: "untagged", count: 7 },
    );
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT count(*) AS n FROM marketing_placements WHERE source='wechat'",
        )
        .get()!.n,
      10,
    );
  } finally {
    f.sqlite.close();
  }
});
test("admin setup, CSRF, password rotation, one-time recovery, and logout protect data", async () => {
  const f = fixture();
  try {
    const state = await activate(f.store);
    assert.equal(
      (
        await f.store.fetch(
          request("bootstrap", "POST", {
            activationHash: digest(state.activation),
          }),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await f.store.fetch(
          request("login", "POST", {
            username: "admin",
            password: "admin",
            activation: state.activation,
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await f.store.fetch(
          request("placements", "GET", undefined, state.cookie),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await f.store.fetch(
          request(
            "placements",
            "POST",
            { code: "test-group", source: "wechat", label: "Private group" },
            state.cookie,
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.store.fetch(
          request(
            "password",
            "POST",
            {
              currentPassword: "a strong test password 2026!",
              newPassword: "admin",
            },
            state.cookie,
            state.csrf,
          ),
        )
      ).status,
      400,
    );
    const recovered = await f.store.fetch(
      request("recover", "POST", {
        username: "admin",
        recoveryKey: state.recoveryKey,
        newPassword: "a recovered password 2026!",
      }),
    );
    assert.equal(recovered.status, 200);
    assert.equal(
      (
        await f.store.fetch(
          request("placements", "GET", undefined, state.cookie),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await f.store.fetch(
          request("recover", "POST", {
            username: "admin",
            recoveryKey: state.recoveryKey,
            newPassword: "another strong password!",
          }),
        )
      ).status,
      401,
    );
    const fresh = (await recovered.json()) as {
        csrf: string;
        recoveryKey: string;
      },
      cookie = recovered.headers.get("Set-Cookie")!.split(";")[0];
    assert.notEqual(fresh.recoveryKey, state.recoveryKey);
    const logout = await f.store.fetch(
      request("logout", "POST", {}, cookie, fresh.csrf),
    );
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("Set-Cookie")!, /Max-Age=0/);
    assert.equal(
      (await f.store.fetch(request("session", "GET", undefined, cookie)))
        .status,
      401,
    );
    const stored = JSON.stringify(
      f.sqlite.prepare("SELECT * FROM marketing_account").all(),
    );
    assert.ok(
      !stored.includes(state.recoveryKey) &&
        !stored.includes("a recovered password"),
    );
  } finally {
    f.sqlite.close();
  }
});
test("first setup expires and login attempts are bounded", async () => {
  const f = fixture();
  try {
    const auth = new PlatformAuth(f.db),
      activation = randomBytes(32).toString("hex");
    auth.bootstrap(digest(activation));
    const account = auth.account()!;
    account.setupExpires = 0;
    f.db.sql.exec(
      "UPDATE marketing_account SET body=?",
      JSON.stringify(account),
    );
    assert.equal(
      (
        await f.store.fetch(
          request("login", "POST", {
            username: "admin",
            password: "admin",
            activation,
          }),
        )
      ).status,
      401,
    );
    for (let i = 0; i < 19; i++)
      await f.store.fetch(
        request("login", "POST", { username: "admin", password: "no" }),
      );
    assert.equal(
      (
        await f.store.fetch(
          request("login", "POST", { username: "admin", password: "no" }),
        )
      ).status,
      429,
    );
  } finally {
    f.sqlite.close();
  }
});
test("placement identity survives navigation, changes start a new visit, and unknown codes are bucketed", () => {
  const f = fixture();
  try {
    const url =
      "https://lavik.dev/en/?utm_source=wechat&utm_medium=social&utm_campaign=test&utm_content=wg01";
    const first = resolveVisit(url, "", undefined, 1000, ["test"]);
    assert.equal(first.visit.placement, "wg01");
    const next = resolveVisit(
      "https://lavik.dev/en/download/",
      url,
      first.visit,
      2000,
      ["test"],
    );
    assert.equal(next.started, false);
    assert.equal(next.visit.placement, "wg01");
    assert.equal(
      resolveVisit(url.replace("wg01", "wg02"), "", next.visit, 3000, ["test"])
        .started,
      true,
    );
    const placements = new PlacementStore(f.db);
    assert.equal(placements.normalize("wg01", "wechat"), "wg01");
    assert.equal(placements.normalize("wg01", "x"), "unregistered");
    assert.equal(
      placements.normalize("private-human-name", "wechat"),
      "unregistered",
    );
    assert.equal(placements.normalize(undefined, "wechat"), "untagged");
  } finally {
    f.sqlite.close();
  }
});
test("share batches are idempotent, destinations are validated, archive stops redirects, and previews do not count", async () => {
  const f = fixture();
  try {
    const s = await activate(f.store),
      input = {
        campaign: "test",
        path: "/en/blog/test/",
        placements: ["wg01", "wg02"],
      };
    const create = () =>
      f.store.fetch(request("links", "POST", input, s.cookie, s.csrf));
    const first = (await (await create()).json()) as {
      links: { id: string; url: string; placement: string }[];
    };
    assert.equal(first.links.length, 2);
    assert.deepEqual(await (await create()).json(), first);
    assert.equal(
      (
        await f.store.fetch(
          request(
            "links",
            "POST",
            { ...input, path: "https://evil.test/" },
            s.cookie,
            s.csrf,
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.store.fetch(
          request(
            "links",
            "POST",
            { ...input, path: "/admin/" },
            s.cookie,
            s.csrf,
          ),
        )
      ).status,
      400,
    );
    const id = first.links[0].id,
      redirect = await f.store.fetch(
        new Request(`https://internal/share/${id}`),
      );
    assert.equal(redirect.status, 302);
    assert.equal(
      new URL(redirect.headers.get("Location")!).searchParams.get(
        "utm_content",
      ),
      first.links[0].placement,
    );
    assert.equal(
      f.sqlite.prepare("SELECT count(*) AS n FROM metrics").get()!.n,
      0,
    );
    await f.store.fetch(
      request(`links/${id}`, "PATCH", { active: false }, s.cookie, s.csrf),
    );
    assert.equal(
      (await f.store.fetch(new Request(`https://internal/share/${id}`))).status,
      404,
    );
    await f.store.fetch(
      request("placements/wg02", "PATCH", { active: false }, s.cookie, s.csrf),
    );
    assert.equal((await create()).status, 400);
  } finally {
    f.sqlite.close();
  }
});
test("placement totals, private labels, recent-hour filters, and CSV exports agree", async () => {
  const f = fixture();
  try {
    const s = await activate(f.store);
    for (const placement of ["wg01", "wg01", "wg02", "arbitrary-secret"]) {
      await f.store.fetch(
        new Request("https://internal/event", {
          method: "POST",
          body: JSON.stringify({
            source: "wechat",
            medium: "social",
            campaign: "test",
            placement,
            path: "/en/",
            event: "visit",
          }),
        }),
      );
    }
    const since = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      end = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const response = await f.store.fetch(
      request(
        `report?since=${since}&until=${end}&source=wechat&placement=wg01`,
        "GET",
        undefined,
        s.cookie,
      ),
    );
    assert.equal(response.status, 200);
    const report = (await response.json()) as Parameters<
      typeof renderReport
    >[0] & { provisional: boolean };
    assert.equal(report.rows.length, 1);
    assert.equal(report.rows[0].count, 2);
    assert.equal(report.rows[0].placement, "wg01");
    assert.equal(report.provisional, true);
    assert.equal(summarizePlacements(report)[0].visits, 2);
    assert.match(renderReport(report).html, /Groups and placements/);
    assert.ok(
      !JSON.stringify(f.sqlite.prepare("SELECT * FROM metrics").all()).includes(
        "arbitrary-secret",
      ),
    );
    assert.equal(csvCell("=danger"), '"\'=danger"');
  } finally {
    f.sqlite.close();
  }
});
test("console host, bootstrap, cross-origin writes, and main-site bootstrap are protected", async () => {
  let calls = 0;
  const env = {
    ASSETS: { fetch: async () => new Response("public shell") },
    ANALYTICS_STORE: {
      idFromName: () => 1,
      get: () => ({
        fetch: async () => {
          calls++;
          return Response.json({});
        },
      }),
    },
  };
  assert.equal(
    (await consoleWorker.fetch(new Request("https://evil.test/"), env)).status,
    404,
  );
  assert.equal(
    (
      await consoleWorker.fetch(
        new Request(`${origin}/api/bootstrap`, { method: "POST" }),
        env,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await consoleWorker.fetch(
        new Request(`${origin}/api/placements`, {
          method: "POST",
          headers: {
            Origin: "https://evil.test",
            "Sec-Fetch-Site": "cross-site",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(calls, 0);
  const shell = await consoleWorker.fetch(new Request(`${origin}/`), env);
  assert.match(
    shell.headers.get("Content-Security-Policy")!,
    /frame-ancestors 'none'/,
  );
  assert.equal(shell.headers.get("Cache-Control"), "no-store");
  const mainEnv = {
    ...env,
    ADMIN_STORE: env.ANALYTICS_STORE,
    ADMIN_ENABLED: "false",
    ANALYTICS_REPORT_TOKEN: "test-report-token-is-at-least-32-characters",
  } as Parameters<typeof siteWorker.fetch>[1];
  assert.equal(
    (
      await siteWorker.fetch(
        new Request("https://lavik.dev/api/analytics/platform-bootstrap", {
          method: "POST",
          body: "{}",
        }),
        mainEnv,
      )
    ).status,
    401,
  );
});
