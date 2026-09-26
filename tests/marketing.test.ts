import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  attribution,
  campaignUrl,
  resolveVisit,
} from "../packages/marketing/attribution.ts";
import {
  analyticsEventSchema,
  analyticsPeriod,
  AnalyticsStore,
} from "../packages/marketing/analytics.ts";
import {
  renderReport,
  summarizeChannels,
} from "../packages/marketing/report.ts";
import worker from "../apps/worker/index.ts";
import type { Database } from "../packages/admin/store.ts";
import {
  calendarDay,
  addCalendarDays,
  mondayOf,
  scheduleSchema,
} from "../packages/marketing/schedule.ts";
import { readFileSync } from "node:fs";
import { publicDimensions } from "../packages/marketing/dimensions.ts";

test("campaign tags survive internal navigation and direct/unknown stays honest", () => {
  const url = campaignUrl("/en/blog/test/", "wechat", "test", ["test"]);
  assert.equal(new URL(url).searchParams.get("utm_source"), "wechat");
  const first = resolveVisit(url, "", undefined, 1000);
  assert.equal(first.started, true);
  assert.equal(first.visit.source, "wechat");
  const next = resolveVisit(
    "https://lavik.dev/en/download/",
    "https://lavik.dev/en/blog/test/",
    first.visit,
    2000,
  );
  assert.equal(next.started, false);
  assert.equal(next.visit.source, "wechat");
  assert.equal(
    resolveVisit("https://lavik.dev/en/", "", undefined, 1000).visit.source,
    "direct",
  );
  assert.equal(
    resolveVisit("https://lavik.dev/en/", "", first.visit, 2_000_000).started,
    true,
  );
  assert.throws(() =>
    campaignUrl("https://attacker.test/", "x", "test", ["test"]),
  );
});
test("SPA navigation does not resurrect the initial document referrer after a tagged campaign", () => {
  const tagged = resolveVisit(
    campaignUrl("/en/", "reddit", "test", ["test"]),
    "https://t.co/example",
    undefined,
    1000,
  );
  assert.equal(
    resolveVisit(
      "https://lavik.dev/en/download/",
      "https://t.co/example",
      tagged.visit,
      2000,
    ).visit.source,
    "reddit",
  );
  const changed = resolveVisit(
    campaignUrl("/en/", "medium", "test", ["test"]),
    "",
    tagged.visit,
    3000,
  );
  assert.equal(changed.started, true);
  assert.equal(changed.visit.source, "medium");
});
test("referral matching uses domain boundaries, and campaign data excludes arbitrary queries", () => {
  assert.equal(
    attribution("https://lavik.dev/en/", "https://www.reddit.com/r/redis/")
      ?.source,
    "reddit",
  );
  assert.equal(
    attribution("https://lavik.dev/en/", "https://reddit.com.attacker.test/")
      ?.source,
    "other_referral",
  );
  assert.equal(
    attribution("https://lavik.dev/en/", "https://chatgpt.com/c/private")
      ?.medium,
    "ai",
  );
  assert.equal(
    attribution("https://lavik.dev/en/", "https://mp.weixin.qq.com/s/x")
      ?.source,
    "wechat",
  );
  assert.equal(
    attribution("https://lavik.dev/en/?email=private@example.com", ""),
    null,
  );
  assert.equal(
    analyticsEventSchema.safeParse({
      event: "visit",
      path: "/en/?email=private",
      source: "x",
      medium: "social",
      campaign: "test",
    }).success,
    false,
  );
  assert.equal(
    analyticsEventSchema.safeParse({
      event: "visit",
      path: "/admin/",
      source: "x",
      medium: "social",
      campaign: "test",
    }).success,
    false,
  );
});
test("aggregate analytics stores counts without visitor identities and bounds report windows", async () => {
  const sql = new DatabaseSync(":memory:");
  const db = {
    sql: {
      exec: (query: string, ...bindings: (string | number | null)[]) => {
        const statement = sql.prepare(query);
        if (query.startsWith("SELECT"))
          return { toArray: () => statement.all(...bindings) };
        statement.run(...bindings);
        return { toArray: () => [] };
      },
    },
    transactionSync: <T>(f: () => T) => f(),
  } as Database;
  let alarm: number | null = null;
  const store = new AnalyticsStore({
    storage: {
      ...db,
      getAlarm: async () => alarm,
      setAlarm: async (at) => {
        alarm = at;
      },
    },
  });
  const a = {
    event: "visit",
    path: "/en/docs/0.1.0/install-docker/",
    source: "x",
    medium: "social",
    campaign: "test",
  };
  try {
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await store.fetch(
            new Request("https://internal/event", {
              method: "POST",
              body: JSON.stringify(a),
            }),
          )
        ).status,
        204,
      );
    const row = sql.prepare("SELECT * FROM metrics").get()!;
    assert.equal(row.count, 2);
    assert.ok(alarm && alarm > Date.now());
    sql
      .prepare("INSERT INTO metrics VALUES(?,?,?,?,?,?,?)")
      .run(
        "2020-01-01T00:00:00.000Z",
        "old",
        "social",
        "old",
        "/en/",
        "visit",
        1,
      );
    await store.alarm();
    assert.equal(sql.prepare("SELECT count(*) AS n FROM metrics").get()!.n, 1);
    assert.deepEqual(
      Object.keys(row).sort(),
      ["hour", "source", "medium", "campaign", "path", "event", "count"].sort(),
    );
    assert.throws(() => analyticsPeriod("2020-01-01", "2026-01-01"));
    assert.throws(() => analyticsPeriod("2026-01-01T00:01:00Z", "2026-01-02"));
  } finally {
    sql.close();
  }
});
test("two-day scheduling crosses month and DST boundaries without a cron reset", () => {
  assert.equal(addCalendarDays("2026-09-30", 2), "2026-10-02");
  assert.equal(addCalendarDays("2026-10-31", 2), "2026-11-02");
  assert.equal(
    calendarDay(new Date("2026-09-27T02:00:00Z"), "America/Los_Angeles"),
    "2026-09-26",
  );
  assert.equal(mondayOf("2026-09-27"), "2026-09-21");
  const config = JSON.parse(
    readFileSync("policies/marketing-schedule.json", "utf8"),
  );
  assert.equal(scheduleSchema.parse(config).maximumModelCallsPerBlog, 4);
  assert.equal(
    scheduleSchema.safeParse({ ...config, maximumModelCallsPerBlog: 100 })
      .success,
    false,
  );
});
test("public ingestion requires same-origin browser requests; reports remain private with Admin disabled", async () => {
  let calls = 0;
  const env = {
    ADMIN_ENABLED: "false",
    ASSETS: {
      fetch: async (r: Request) =>
        Response.json(
          new URL(r.url).pathname === "/discovery-manifest.json"
            ? { pages: { "https://lavik.dev/en/": "hash" } }
            : { articles: [{ id: "test" }] },
        ),
    },
    ADMIN_STORE: {
      idFromName: () => "admin",
      get: () => ({
        fetch: async () => {
          throw new Error("Admin must remain disabled");
        },
      }),
    },
    ANALYTICS_STORE: {
      idFromName: () => "metrics",
      get: () => ({
        fetch: async () => {
          calls++;
          return new Response(null, { status: 204 });
        },
      }),
    },
    ANALYTICS_REPORT_TOKEN: "a-private-report-token",
  };
  assert.equal(
    (
      await worker.fetch(
        new Request("https://lavik.dev/api/analytics/report"),
        env,
      )
    ).status,
    401,
  );
  const body = JSON.stringify({
    event: "visit",
    path: "/en/",
    source: "x",
    medium: "social",
    campaign: "test",
  });
  assert.equal(
    (
      await worker.fetch(
        new Request("https://lavik.dev/api/analytics/event", {
          method: "POST",
          body,
        }),
        env,
      )
    ).status,
    403,
  );
  const headers = {
    Origin: "https://lavik.dev",
    "Sec-Fetch-Site": "same-origin",
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await worker.fetch(
        new Request("https://lavik.dev/api/analytics/event", {
          method: "POST",
          headers,
          body,
        }),
        env,
      )
    ).status,
    204,
  );
  assert.equal(calls, 1);
  assert.equal(
    (await worker.fetch(new Request("https://lavik.dev/api/admin/tasks"), env))
      .status,
    410,
  );
  const limited = {
    ...env,
    ANALYTICS_RATE_LIMIT: { limit: async () => ({ success: false }) },
  };
  assert.equal(
    (
      await worker.fetch(
        new Request("https://lavik.dev/api/analytics/event", {
          method: "POST",
          headers,
          body,
        }),
        limited,
      )
    ).status,
    429,
  );
});
test("weekly reporting separates action counts and refuses to imply historical traffic", () => {
  const rows = [
    {
      source: "x",
      medium: "social",
      campaign: "test",
      path: "/en/",
      event: "visit",
      count: 5,
    },
    {
      source: "x",
      medium: "social",
      campaign: "test",
      path: "/en/download/",
      event: "download",
      count: 2,
    },
  ];
  assert.equal(summarizeChannels(rows)[0].visits, 5);
  assert.equal(summarizeChannels(rows)[0].download, 2);
  const empty = renderReport({
    since: "2026-09-14",
    until: "2026-09-21",
    generatedAt: "2026-09-26",
    rows: [],
  });
  assert.match(empty.html, /not a historical backfill/);
  assert.deepEqual(
    summarizeChannels(rows.map((r) => ({ ...r, source: "diagnostic" }))),
    [],
  );
});
test("unregistered campaign values and private referrer subdomains are discarded", () => {
  const value = attribution(
    "https://lavik.dev/en/?utm_source=x&utm_medium=alice@example.com&utm_campaign=alice@example.com",
    "",
    ["approved-blog"],
  );
  assert.deepEqual(value, {
    source: "x",
    medium: "campaign",
    campaign: "unregistered",
  });
  assert.equal(
    attribution(
      "https://lavik.dev/en/",
      "https://alice.customer.example.com/private",
    )?.source,
    "other_referral",
  );
  assert.throws(() => campaignUrl("/en/", "x", "alice", ["approved-blog"]));
});
test("server accepts only deployed public page paths and discards unregistered campaign values", async () => {
  const assets = {
    fetch: async (r: Request) =>
      Response.json(
        new URL(r.url).pathname === "/discovery-manifest.json"
          ? {
              pages: {
                "https://lavik.dev/en/docs/0.1.0/install-docker/": "hash",
              },
            }
          : { articles: [{ id: "approved-blog" }] },
      ),
  };
  const event = analyticsEventSchema.parse({
    event: "install",
    path: "/en/docs/0.1.0/install-docker/",
    source: "x",
    medium: "social",
    campaign: "alice-example.com",
  });
  assert.equal(
    (await publicDimensions(assets, event))?.campaign,
    "unregistered",
  );
  assert.equal(
    await publicDimensions(assets, { ...event, path: "/en/private-person/" }),
    null,
  );
  assert.equal(
    (await publicDimensions(assets, { ...event, campaign: "approved-blog" }))
      ?.campaign,
    "approved-blog",
  );
});
