import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { TaskStore, type Database } from "../packages/admin/store.ts";
import { artifactHash } from "../packages/admin/artifact-id.ts";
import { publicationResult } from "./publication-fixture.ts";
import { sources } from "../packages/content/repository.ts";
import {
  verifyAdmin,
  verifyRunner,
  validateMutation,
} from "../packages/admin/auth.ts";
import { executeTask } from "../packages/admin/execute.ts";
import { articles } from "../packages/content/repository.ts";
import { storedReceipt } from "../packages/content/gate.ts";
import type { AgentRuntime } from "../packages/agents/workflow.ts";
import type { Task } from "../packages/admin/contracts.ts";
import workerApp from "../apps/worker/index.ts";
import { AdminStore } from "../apps/worker/index.ts";
import {
  WorkerDispatcher,
  type AlarmStorage,
} from "../packages/admin/dispatch.ts";

test("production worker keeps public pages available and fails closed before Access is configured", async () => {
  let storeCalls = 0;
  const env = {
    ADMIN_ENABLED: "true",
    ADMIN_EMAIL: "owner@example.test",
    ASSETS: {
      async fetch() {
        return new Response("Public website");
      },
    },
    ADMIN_STORE: {
      idFromName: (name: string) => name,
      get() {
        storeCalls++;
        return {
          async fetch() {
            return new Response("Private state");
          },
        };
      },
    },
  };
  assert.equal(
    await (
      await workerApp.fetch(new Request("https://lavik.dev/en/"), env)
    ).text(),
    "Public website",
  );
  for (const path of ["/admin", "/admin/", "/api/admin/dashboard"]) {
    const response = await workerApp.fetch(
      new Request(`https://lavik.dev${path}`, {
        headers: { "X-Admin-Actor": "owner@example.test" },
      }),
      env,
    );
    assert.equal(response.status, 503);
  }
  assert.equal(
    (
      await workerApp.fetch(
        new Request("https://lavik.dev/api/admin/dashboard"),
        {
          ...env,
          ACCESS_AUD: "configured-app",
          ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com",
        },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await workerApp.fetch(
        new Request("https://lavik.dev/api/runner/claim", {
          method: "POST",
          headers: { "X-Runner-Authorized": "true" },
        }),
        env,
      )
    ).status,
    401,
  );
  assert.equal(storeCalls, 0);
  const runnerToken = "runner-token-with-at-least-32-characters";
  const publisherToken = "publisher-token-with-at-least-32-characters";
  assert.equal(
    (
      await workerApp.fetch(
        new Request("https://lavik.dev/api/publisher/claim", {
          method: "POST",
          headers: { Authorization: `Bearer ${runnerToken}` },
          body: "{}",
        }),
        { ...env, RUNNER_TOKEN: runnerToken, PUBLISHER_TOKEN: publisherToken },
      )
    ).status,
    401,
  );
  assert.equal(storeCalls, 0);
  assert.equal(
    (
      await workerApp.fetch(
        new Request("https://lavik.dev/api/publisher/claim", {
          method: "POST",
          headers: { Authorization: `Bearer ${publisherToken}` },
          body: "{}",
        }),
        { ...env, RUNNER_TOKEN: runnerToken, PUBLISHER_TOKEN: publisherToken },
      )
    ).status,
    200,
  );
});

function harness() {
  const sqlite = new DatabaseSync(":memory:");
  const db: Database = {
    sql: {
      exec(query, ...bindings) {
        if (query.startsWith("CREATE TABLE")) {
          sqlite.exec(query);
          return { toArray: () => [] };
        }
        const rows = sqlite.prepare(query).all(...bindings);
        return { toArray: () => rows as never };
      },
    },
    transactionSync(callback) {
      sqlite.exec("BEGIN");
      try {
        const result = callback();
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const store = new TaskStore(db);
  const api = async (
    path: string,
    body?: unknown,
    runner = false,
    publisher = false,
  ) =>
    store.fetch(
      new Request(`https://lavik.dev${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "X-Admin-Actor": "owner@example.test",
          ...(runner ? { "X-Runner-Authorized": "true" } : {}),
          ...(publisher ? { "X-Publisher-Authorized": "true" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { db, sqlite, api, store };
}

test("disabled Admin rejects every hosted agent surface before authentication or storage", async () => {
  for (const ADMIN_ENABLED of [undefined, "false"]) {
    const env = {
      ADMIN_ENABLED,
      ADMIN_LOCAL: "true",
      RUNNER_TOKEN: "valid-runner-token-with-at-least-32-characters",
      PUBLISHER_TOKEN: "valid-publisher-token-with-at-least-32-characters",
      ASSETS: {
        async fetch() {
          return new Response("Public website");
        },
      },
      ADMIN_STORE: {
        idFromName() {
          throw new Error("Disabled Admin must not open storage");
        },
        get() {
          throw new Error("Disabled Admin must not open storage");
        },
      },
    };
    for (const path of [
      "/admin",
      "/admin/",
      "/api/admin/tasks",
      "/api/runner/wake",
      "/api/runner/claim",
      "/api/publisher/claim",
    ]) {
      for (const method of ["GET", "POST"]) {
        const response = await workerApp.fetch(
          new Request(`http://localhost${path}`, {
            method,
            headers: {
              Authorization: `Bearer ${path.includes("publisher") ? env.PUBLISHER_TOKEN : env.RUNNER_TOKEN}`,
              "X-Admin-Actor": "owner@example.test",
            },
            ...(method === "POST" ? { body: "{}" } : {}),
          }),
          env,
        );
        assert.equal(response.status, 410, path);
        assert.match((await response.json()).error, /disabled/);
        assert.equal(response.headers.get("Cache-Control"), "no-store");
      }
    }
    assert.equal(
      await (
        await workerApp.fetch(new Request("https://lavik.dev/en/"), env)
      ).text(),
      "Public website",
    );
  }
});
const input = () => ({
  requestId: crypto.randomUUID(),
  role: "blog-writer",
  title: "Explain storage",
  brief: "Explain the NVMe storage architecture.",
});
const worker = {
  runnerId: "test-worker",
  model: "test-writer",
  reviewerModel: "test-reviewer",
  catalog: [],
};
const publisherWorker = {
  runnerId: "publisher-test",
  runUrl: "https://github.com/eloqdata/lavik-agent/actions/runs/123",
};
async function reviewedTask(h: ReturnType<typeof harness>, pass = true) {
  const task = (await (
    await h.api("/api/admin/tasks", { ...input(), role: "manual-writer" })
  ).json()) as Task;
  const claim = await (await h.api("/api/runner/claim", worker, true)).json();
  const result = publicationResult(task.id);
  if (!pass)
    result.editions[1].review = {
      verdict: "revise",
      findings: ["Fix the scope"],
      checkedSourceIds: [],
    };
  assert.equal(
    (
      await h.api(
        `/api/runner/tasks/${task.id}`,
        { leaseToken: claim.leaseToken, stage: "complete", result },
        true,
      )
    ).status,
    200,
  );
  return { task, result };
}

test("passing review queues exactly one publication and only a publisher can report its verified deployment", async () => {
  const h = harness();
  try {
    const { task, result } = await reviewedTask(h);
    assert.equal(h.store.workStatus().publications, 1);
    const original = await (await h.api(`/api/admin/tasks/${task.id}`)).json();
    assert.equal(original.task.status, "approved");
    assert.equal(
      original.task.publication.artifactHash,
      await artifactHash(result),
    );
    assert.equal(
      (await h.api("/api/publisher/claim", publisherWorker, true)).status,
      404,
    );
    const claim = await (
      await h.api("/api/publisher/claim", publisherWorker, false, true)
    ).json();
    const repeated = await (
      await h.api("/api/publisher/claim", publisherWorker, false, true)
    ).json();
    assert.equal(repeated.leaseToken, claim.leaseToken);
    assert.equal(
      (
        await (
          await h.api(
            "/api/publisher/claim",
            { ...publisherWorker, runUrl: publisherWorker.runUrl + "4" },
            false,
            true,
          )
        ).json()
      ).task,
      null,
    );
    const body = {
      leaseToken: claim.leaseToken,
      artifactHash: claim.publication.artifactHash,
      commit: "a".repeat(40),
      deploymentId: crypto.randomUUID(),
    };
    const update = (data: object) =>
      h.api(
        `/api/publisher/tasks/${task.id}`,
        { ...body, ...data },
        false,
        true,
      );
    assert.equal((await update({ stage: "published" })).status, 400);
    assert.equal(
      (await update({ stage: "deploying", artifactHash: "b".repeat(64) }))
        .status,
      409,
    );
    assert.equal((await update({ stage: "deploying" })).status, 200);
    assert.equal((await update({ stage: "published" })).status, 200);
    assert.equal((await update({ stage: "published" })).status, 200);
    assert.equal(
      (await update({ stage: "failed", error: "Late callback" })).status,
      409,
    );
    const published = (
      await (await h.api(`/api/admin/tasks/${task.id}`)).json()
    ).task;
    assert.equal(published.status, "published");
    assert.equal(
      published.publication.urls.en,
      `https://lavik.dev/en/docs/0.1.0/${result.editions[0].article.slug}/`,
    );
    assert.equal(h.store.workStatus().publications, 0);
  } finally {
    h.sqlite.close();
  }
});

test("review findings and an approved feedback comment cannot publish; a revision cancels queued publication", async () => {
  const h = harness();
  try {
    const { task } = await reviewedTask(h, false);
    await h.api(`/api/admin/tasks/${task.id}/feedback`, {
      requestId: crypto.randomUUID(),
      message: "approved",
      action: "comment",
    });
    assert.equal(
      (
        await (
          await h.api("/api/publisher/claim", publisherWorker, false, true)
        ).json()
      ).task,
      null,
    );
    const passed = await reviewedTask(h);
    await h.api(`/api/admin/tasks/${passed.task.id}/feedback`, {
      requestId: crypto.randomUUID(),
      message: "Clarify the scope before publishing.",
      action: "revise",
    });
    assert.equal(
      (
        await (
          await h.api("/api/publisher/claim", publisherWorker, false, true)
        ).json()
      ).task,
      null,
    );
    assert.equal(
      (await (await h.api(`/api/admin/tasks/${passed.task.id}`)).json()).task
        .publication.status,
      "cancelled",
    );
  } finally {
    h.sqlite.close();
  }
});

test("interrupted publication recovers its immutable artifact and rejects the old lease", async () => {
  const h = harness();
  try {
    const { task } = await reviewedTask(h);
    const claim = await (
      await h.api("/api/publisher/claim", publisherWorker, false, true)
    ).json();
    const expired = {
      ...claim.publication,
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    h.db.sql.exec(
      "UPDATE publications SET body=? WHERE task_id=?",
      JSON.stringify(expired),
      task.id,
    );
    h.store.refreshLeases();
    const queued = (await (await h.api(`/api/admin/tasks/${task.id}`)).json())
      .task.publication;
    assert.equal(queued.status, "queued");
    assert.equal(queued.artifactHash, claim.publication.artifactHash);
    queued.nextAttemptAt = new Date(Date.now() - 1000).toISOString();
    h.db.sql.exec(
      "UPDATE publications SET body=? WHERE task_id=?",
      JSON.stringify(queued),
      task.id,
    );
    const retry = await (
      await h.api("/api/publisher/claim", publisherWorker, false, true)
    ).json();
    assert.notEqual(retry.leaseToken, claim.leaseToken);
    assert.equal(retry.publication.attempts, 2);
    assert.equal(
      (
        await h.api(
          `/api/publisher/tasks/${task.id}`,
          {
            leaseToken: claim.leaseToken,
            artifactHash: claim.publication.artifactHash,
            stage: "heartbeat",
          },
          false,
          true,
        )
      ).status,
      409,
    );
    await h.api(
      `/api/publisher/tasks/${task.id}`,
      {
        leaseToken: retry.leaseToken,
        artifactHash: retry.publication.artifactHash,
        stage: "failed",
        error: "Stale evidence",
        retryable: false,
      },
      false,
      true,
    );
    assert.equal(
      (await (await h.api(`/api/admin/tasks/${task.id}`)).json()).task.status,
      "publication_failed",
    );
    assert.equal(
      (await h.api(`/api/admin/tasks/${task.id}/retry-publication`, {})).status,
      200,
    );
    assert.equal(
      (
        await (
          await h.api("/api/publisher/claim", publisherWorker, false, true)
        ).json()
      ).publication.artifactHash,
      claim.publication.artifactHash,
    );
  } finally {
    h.sqlite.close();
  }
});

function dispatchHarness(http: typeof fetch, configured = true) {
  const h = harness();
  let clock = Date.now();
  let next: number | null = null;
  const alarms: AlarmStorage = {
    async getAlarm() {
      return next;
    },
    async setAlarm(at) {
      next = at;
    },
    async deleteAlarm() {
      next = null;
    },
  };
  const config = {
    ADMIN_ENABLED: "true",
    ...(configured ? { GITHUB_DISPATCH_TOKEN: "private-test-token" } : {}),
  };
  const recreate = () =>
    new WorkerDispatcher(h.store, alarms, config, http, () => clock);
  return {
    ...h,
    alarms,
    config,
    recreate,
    get next() {
      return next;
    },
    async tick() {
      assert.notEqual(next, null);
      clock = next!;
      next = null;
      await recreate().alarm();
    },
  };
}

test("disabling Admin removes persisted wake-ups and preserves queued history without GitHub calls", async () => {
  for (const ADMIN_ENABLED of [undefined, "false"]) {
    const h = dispatchHarness(async () => {
      throw new Error("Disabled dispatcher must not call GitHub");
    });
    try {
      const task = await (await h.api("/api/admin/tasks", input())).json();
      await h.recreate().ensureAlarm();
      assert.notEqual(h.next, null);
      const config = {
        ADMIN_ENABLED,
        GITHUB_DISPATCH_TOKEN: h.config.GITHUB_DISPATCH_TOKEN,
      };
      const disabledDispatcher = new WorkerDispatcher(
        h.store,
        h.alarms,
        config,
      );
      await disabledDispatcher.alarm();
      assert.equal(h.next, null);
      await disabledDispatcher.ensureAlarm();
      assert.equal(h.next, null);
      const app = new AdminStore({ storage: { ...h.db, ...h.alarms } }, config);
      assert.equal(
        (
          await app.fetch(
            new Request("https://lavik.dev/api/admin/tasks", {
              method: "POST",
              body: JSON.stringify(input()),
            }),
          )
        ).status,
        410,
      );
      assert.equal(h.store.workStatus().queued, 1);
      assert.equal(
        (await (await h.api(`/api/admin/tasks/${task.id}`)).json()).task.id,
        task.id,
      );
    } finally {
      h.sqlite.close();
    }
  }
});

test("durable alarms dispatch once, recover after restart, monitor startup and hand off queued tasks", async () => {
  let posts = 0;
  let active = false;
  const h = dispatchHarness(async (url, options) => {
    assert.ok(
      String(url).startsWith(
        "https://api.github.com/repos/eloqdata/lavik-agent/actions/",
      ),
    );
    assert.equal(
      new Headers(options?.headers).get("Authorization"),
      "Bearer private-test-token",
    );
    if (options?.method === "POST") {
      posts++;
      assert.deepEqual(JSON.parse(options.body as string), { ref: "main" });
      active = true;
      return Response.json({ workflow_run_id: posts });
    }
    return Response.json({
      workflow_runs: active
        ? [
            {
              id: posts,
              status: "in_progress",
              created_at: new Date().toISOString(),
            },
          ]
        : [],
    });
  });
  try {
    await h.api("/api/admin/tasks", input());
    await h.api("/api/admin/tasks", input());
    await h.recreate().ensureAlarm();
    await h.tick();
    assert.equal(posts, 1);
    assert.equal(h.store.dispatchStatus().state, "starting");
    assert.match(h.store.dispatchStatus().runUrl!, /\/runs\/1$/);
    await Promise.all([h.recreate().ensureAlarm(), h.recreate().ensureAlarm()]);
    await h.tick();
    assert.equal(posts, 1, "an active run must not be dispatched again");
    const claim = await (await h.api("/api/runner/claim", worker, true)).json();
    await h.tick();
    assert.equal(h.store.dispatchStatus().state, "running");
    await h.api(
      `/api/runner/tasks/${claim.task.id}`,
      { leaseToken: claim.leaseToken, stage: "failed", error: "Test failure" },
      true,
    );
    active = false;
    await h.tick();
    assert.equal(posts, 2, "remaining queue starts without a browser or cron");
    const next = await (await h.api("/api/runner/claim", worker, true)).json();
    await h.api(`/api/admin/tasks/${next.task.id}/cancel`, {});
    await h.tick();
    assert.equal(h.store.dispatchStatus().state, "idle");
    assert.equal(h.next, null);
  } finally {
    h.sqlite.close();
  }
});

test("lost dispatch responses reconcile an existing GitHub run before retrying", async () => {
  let posts = 0;
  const h = dispatchHarness(async (_url, options) => {
    if (options?.method === "POST") {
      posts++;
      throw new Error("private-test-token network details must not be saved");
    }
    return Response.json({
      workflow_runs: posts
        ? [{ id: 42, status: "queued", created_at: new Date().toISOString() }]
        : [],
    });
  });
  try {
    await h.api("/api/admin/tasks", input());
    await h.recreate().ensureAlarm();
    await h.tick();
    assert.equal(h.store.dispatchStatus().state, "retrying");
    assert.doesNotMatch(
      JSON.stringify(h.store.dispatchStatus()),
      /private-test-token/,
    );
    await h.tick();
    assert.equal(posts, 1);
    assert.equal(h.store.dispatchStatus().state, "starting");
    assert.match(h.store.dispatchStatus().runUrl!, /42$/);
  } finally {
    h.sqlite.close();
  }
});

test("default dispatch transport preserves Cloudflare's native fetch receiver", async (t) => {
  let posts = 0;
  t.mock.method(
    globalThis,
    "fetch",
    function (this: unknown, _url: unknown, options?: RequestInit) {
      assert.ok(
        this === undefined || this === globalThis,
        "native fetch cannot receive the dispatcher as this",
      );
      assert.equal(
        options?.redirect,
        "manual",
        "Workerd requires manual redirect handling",
      );
      if (options?.method === "POST") {
        posts++;
        return Promise.resolve(Response.json({ workflow_run_id: 101 }));
      }
      return Promise.resolve(Response.json({ workflow_runs: [] }));
    },
  );
  const h = dispatchHarness(fetch);
  try {
    await h.api("/api/admin/tasks", input());
    await new WorkerDispatcher(h.store, h.alarms, h.config).alarm();
    assert.equal(posts, 1);
    assert.equal(h.store.dispatchStatus().state, "starting");
  } finally {
    h.sqlite.close();
  }
});

test("authenticated startup probe exercises dispatch without creating tasks or invoking a model", async () => {
  let posts = 0;
  const h = dispatchHarness(async (_url, options) => {
    if (options?.method === "POST") {
      posts++;
      return Response.json({ workflow_run_id: 99 });
    }
    return Response.json({ workflow_runs: [] });
  });
  try {
    assert.equal((await h.api("/api/runner/wake", {})).status, 404);
    assert.equal(
      (
        await h.api(
          "/api/runner/wake",
          { brief: "Do not accept task content" },
          true,
        )
      ).status,
      400,
    );
    await h.recreate().ensureAlarm();
    assert.equal((await h.api("/api/runner/wake", {}, true)).status, 202);
    await h.tick();
    assert.equal(posts, 1);
    assert.equal(h.store.workStatus().queued, 0);
    assert.equal(h.store.workStatus().probe, true);
    assert.equal(
      (await (await h.api("/api/runner/check", worker, true)).json()).ready,
      false,
    );
    await h.tick();
    assert.equal(h.store.workStatus().probe, false);
    assert.equal(h.next, null);
  } finally {
    h.sqlite.close();
  }
});

test("missing or expired dispatch credentials are visible, recoverable, and do not lose tasks", async () => {
  let calls = 0;
  const h = dispatchHarness(async () => {
    calls++;
    return new Response("private-test-token provider error", { status: 401 });
  }, false);
  try {
    await h.api("/api/admin/tasks", input());
    await h.recreate().ensureAlarm();
    await h.tick();
    assert.equal(calls, 0);
    assert.equal(h.store.dispatchStatus().state, "unconfigured");
    const oldAlarm = h.next;
    h.config.GITHUB_DISPATCH_TOKEN = "private-test-token";
    await h.recreate().ensureAlarm();
    assert.ok(h.next! < oldAlarm!);
    await h.tick();
    assert.equal(calls, 1);
    assert.equal(h.store.workStatus().queued, 1);
    assert.match(h.store.dispatchStatus().message, /401/);
    assert.doesNotMatch(
      JSON.stringify(h.store.dispatchStatus()),
      /private-test-token/,
    );
    const firstRetry = h.next;
    await h.tick();
    assert.ok(h.next! - firstRetry! >= 120_000, "failures back off durably");
    assert.equal(
      (await (await h.api("/api/admin/dashboard")).json()).dispatch.state,
      "retrying",
    );
  } finally {
    h.sqlite.close();
  }
});

test("a cancellation during GitHub lookup prevents a useless worker launch", async () => {
  let task: Task;
  let posts = 0;
  const h = dispatchHarness(async (_url, options) => {
    if (options?.method === "POST") posts++;
    await h.api(`/api/admin/tasks/${task.id}/cancel`, {});
    return Response.json({ workflow_runs: [] });
  });
  try {
    task = await (await h.api("/api/admin/tasks", input())).json();
    await h.recreate().ensureAlarm();
    await h.tick();
    assert.equal(posts, 0);
    await h.tick();
    assert.equal(h.next, null);
  } finally {
    h.sqlite.close();
  }
});

test("queue mutations require a persisted alarm and operational status is authenticated without content", async () => {
  const h = harness();
  let fail = true;
  let alarm: number | null = null;
  const app = new AdminStore(
    {
      storage: {
        ...h.db,
        async getAlarm() {
          return alarm;
        },
        async setAlarm(at) {
          if (fail) throw new Error("Storage unavailable");
          alarm = at;
        },
        async deleteAlarm() {
          alarm = null;
        },
      },
    },
    { ADMIN_ENABLED: "true" },
  );
  const create = () =>
    app.fetch(
      new Request("https://lavik.dev/api/admin/tasks", {
        method: "POST",
        headers: { "X-Admin-Actor": "owner@example.test" },
        body: JSON.stringify(input()),
      }),
    );
  try {
    await assert.rejects(create(), /Storage unavailable/);
    assert.equal(h.store.workStatus().queued, 0);
    fail = false;
    assert.equal((await create()).status, 201);
    assert.notEqual(alarm, null);
    assert.equal((await h.api("/api/runner/status")).status, 404);
    const response = await h.api("/api/runner/status", undefined, true);
    const status = await response.json();
    assert.equal(status.queued, 1);
    assert.equal(status.tasks.length, 1);
    assert.doesNotMatch(
      JSON.stringify(status),
      /Explain storage|NVMe|owner@example/,
    );
  } finally {
    h.sqlite.close();
  }
});
test("durable queue is idempotent, claims one task, and rejects stale callbacks after cancellation", async () => {
  const { api, sqlite } = harness();
  try {
    const body = input();
    const task = (await (await api("/api/admin/tasks", body)).json()) as Task;
    assert.equal(
      (await (await api("/api/admin/tasks", body)).json()).id,
      task.id,
    );
    assert.equal(
      (
        await api("/api/admin/tasks", {
          ...body,
          brief: "Different task content.",
        })
      ).status,
      409,
    );
    await api("/api/admin/tasks", input());
    assert.equal(
      (await (await api("/api/runner/check", worker, true)).json()).ready,
      true,
    );
    await api(`/api/admin/tasks/${task.id}/feedback`, {
      requestId: crypto.randomUUID(),
      message: "Include the storage prerequisites.",
      action: "comment",
    });
    const claims = await Promise.all([
      api("/api/runner/claim", worker, true),
      api("/api/runner/claim", worker, true),
    ]);
    const values = await Promise.all(claims.map((r) => r.json()));
    assert.equal(values.filter((v) => v.task).length, 1);
    const claim = values.find((v) => v.task);
    assert.ok(claim.feedback.includes("Include the storage prerequisites."));
    assert.equal(
      (await (await api("/api/runner/check", worker, true)).json()).ready,
      false,
    );
    await api(`/api/admin/tasks/${claim.task.id}/cancel`, {});
    assert.equal(
      (
        await api(
          `/api/runner/tasks/${claim.task.id}`,
          { leaseToken: claim.leaseToken, stage: "complete" },
          true,
        )
      ).status,
      409,
    );
    assert.ok(
      (await (await api("/api/runner/claim", worker, true)).json()).task,
    );
  } finally {
    sqlite.close();
  }
});
test("expired workers become failed and feedback retries retain the original history", async () => {
  const { api, sqlite, db } = harness();
  try {
    const task = (await (
      await api("/api/admin/tasks", input())
    ).json()) as Task;
    const claim = await (await api("/api/runner/claim", worker, true)).json();
    db.sql.exec(
      "UPDATE tasks SET body = ? WHERE id = ?",
      JSON.stringify({
        ...claim.task,
        leaseExpiresAt: "2000-01-01T00:00:00.000Z",
      }),
      task.id,
    );
    const detail = await (await api(`/api/admin/tasks/${task.id}`)).json();
    assert.equal(detail.task.status, "failed");
    assert.ok(
      detail.events.some((e: { type: string }) => e.type === "worker-lost"),
    );
    const feedback = {
      requestId: crypto.randomUUID(),
      message: "Clarify the prerequisites.",
      action: "retry",
    };
    const revision = await (
      await api(`/api/admin/tasks/${task.id}/feedback`, feedback)
    ).json();
    assert.equal(revision.task.parentId, task.id);
    assert.equal(
      (
        await (
          await api(`/api/admin/tasks/${task.id}/feedback`, feedback)
        ).json()
      ).task.id,
      revision.task.id,
    );
    const dashboard = await (await api("/api/admin/dashboard")).json();
    assert.equal(dashboard.tasks.length, 2);
    const next = await (await api("/api/runner/claim", worker, true)).json();
    assert.deepEqual(next.feedback, [feedback.message]);
    assert.equal(
      (
        await api(
          `/api/runner/tasks/${task.id}`,
          { leaseToken: claim.leaseToken, stage: "Still running" },
          true,
        )
      ).status,
      409,
    );
  } finally {
    sqlite.close();
  }
});
test("Access verifies signature, audience, expiry and owner email; headers alone grant no access", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const key = await exportJWK(publicKey);
  key.kid = "test";
  const resolver = createLocalJWKSet({ keys: [key] });
  const env = {
    ACCESS_TEAM_DOMAIN: "lavik-test.cloudflareaccess.com",
    ACCESS_AUD: "admin-app",
    ADMIN_EMAIL: "owner@example.test",
  };
  const jwt = async (
    email: string,
    audience = "admin-app",
    expiration = "2h",
  ) =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("owner")
      .setIssuedAt()
      .setIssuer("https://lavik-test.cloudflareaccess.com")
      .setAudience(audience)
      .setExpirationTime(expiration)
      .sign(privateKey);
  const req = (token: string) =>
    new Request("https://lavik.dev/api/admin/dashboard", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    });
  assert.equal(
    await verifyAdmin(req(await jwt("owner@example.test")), env, resolver),
    "owner@example.test",
  );
  await assert.rejects(
    verifyAdmin(req(await jwt("someone@example.test")), env, resolver),
  );
  await assert.rejects(
    verifyAdmin(
      req(await jwt("owner@example.test", "another-app")),
      env,
      resolver,
    ),
  );
  await assert.rejects(
    verifyAdmin(
      req(await jwt("owner@example.test", "admin-app", "-1h")),
      env,
      resolver,
    ),
  );
  await assert.rejects(
    verifyAdmin(
      new Request("https://lavik.dev/api/admin/dashboard", {
        headers: { "Cf-Access-Authenticated-User-Email": "owner@example.test" },
      }),
      env,
      resolver,
    ),
  );
  await assert.rejects(
    verifyAdmin(req("forged"), { ADMIN_LOCAL: "true" }, resolver),
  );
  assert.throws(() =>
    validateMutation(
      new Request("https://lavik.dev/api/admin/tasks", {
        method: "POST",
        headers: {
          Origin: "https://attacker.test",
          "Content-Type": "application/json",
        },
      }),
    ),
  );
  assert.equal(
    await verifyRunner(
      new Request("https://lavik.dev/api/runner/claim", {
        headers: { Authorization: `Bearer ${"s".repeat(40)}` },
      }),
      { RUNNER_TOKEN: "s".repeat(40) },
    ),
    true,
  );
  assert.equal(
    await verifyRunner(new Request("https://lavik.dev/api/runner/claim"), {
      RUNNER_TOKEN: "s".repeat(40),
    }),
    false,
  );
});
const baseTask = (role: Task["role"]): Task => ({
  id: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
  role,
  title: "Explain Lavik",
  brief: "Explain Lavik's storage architecture.",
  status: "running",
  stage: "Starting",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "test",
});
function model(): AgentRuntime {
  return {
    identity: "test-model",
    async write(input, verify) {
      await verify("basic-commands");
      const article = structuredClone(
        articles().find((a) => a.locale === input.locale)!,
      );
      article.kind = input.kind ?? "blog";
      if (article.kind === "blog") article.topics = ["architecture"];
      article.blocks = [
        {
          type: "paragraph",
          text: "Lavik stores values on storage.",
          sources: ["readme"],
        },
        { type: "recipe", recipeId: "basic-commands" },
      ];
      return article;
    },
    async review() {
      return { verdict: "pass", findings: [], checkedSourceIds: ["readme"] };
    },
  };
}
test("manual writing checkpoints both languages, passes owner feedback and independently reviews execution receipts", async () => {
  const runtime = model();
  const write = runtime.write.bind(runtime);
  let checks = 0,
    reviews = 0,
    checkpoints = 0;
  runtime.write = async (input, verify) => {
    assert.equal(input.kind, "docs");
    assert.equal(input.rendererVersion, 2);
    assert.ok(input.feedback.includes("State prerequisites."));
    return write(input, verify);
  };
  runtime.review = async (article, receipts, context) => {
    reviews++;
    assert.equal(article.kind, "docs");
    assert.equal(receipts[0].status, "passed");
    assert.equal(context?.rendererVersion, 2);
    return { verdict: "pass", findings: [], checkedSourceIds: ["readme"] };
  };
  const result = await executeTask(
    baseTask("manual-writer"),
    runtime,
    async () => {
      checks++;
      return storedReceipt("basic-commands");
    },
    async (progress) => {
      if (progress.result) checkpoints++;
    },
    undefined,
    ["State prerequisites."],
  );
  assert.equal(result.editions.length, 2);
  assert.equal(checks, 2);
  assert.equal(reviews, 2);
  assert.ok(checkpoints >= 4);
});
test("review-only tasks never call a writer and failed execution cannot pass review", async () => {
  const runtime = model();
  runtime.write = async () => {
    throw new Error("Must not write during a review-only task");
  };
  const task = { ...baseTask("manual-reviewer"), articleId: "quick-start" };
  let calls = 0;
  runtime.review = async () => {
    calls++;
    return { verdict: "pass", findings: [], checkedSourceIds: [] };
  };
  const result = await executeTask(
    task,
    runtime,
    async () => ({ ...storedReceipt("basic-commands"), status: "failed" }),
    async () => {},
  );
  assert.equal(calls, 0);
  assert.ok(result.editions.every((e) => e.review.verdict === "blocked"));
});

test("a revision carries previous review findings and preserves an existing public URL", async () => {
  const id = crypto.randomUUID();
  const task: Task = {
    ...input(),
    id,
    role: "blog-writer",
    articleId: "reading-benchmarks",
    status: "running",
    stage: "Starting",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "owner@example.test",
  };
  const previous = publicationResult(id);
  previous.editions = (["en", "zh-CN"] as const).map((locale) => ({
    ...previous.editions.find((e) => e.article.locale === locale)!,
    article: articles().find(
      (article) =>
        article.id === "reading-benchmarks" && article.locale === locale,
    )!,
    review: {
      verdict: "revise",
      findings: ["Carry this reviewer finding into the revision."],
      checkedSourceIds: [],
    },
  }));
  const result = await executeTask(
    task,
    {
      identity: "test-independent-reviewer",
      async write(input) {
        assert.ok(
          input.feedback.includes(
            "Carry this reviewer finding into the revision.",
          ),
        );
        return { ...input.previous!, slug: "a-model-suggested-new-url" };
      },
      async review(article) {
        assert.equal(article.id, "reading-benchmarks");
        assert.equal(article.slug, "reading-the-benchmark");
        return {
          verdict: "pass",
          findings: [],
          checkedSourceIds: sources.map((s) => s.id),
        };
      },
    },
    async () => {
      throw new Error("This article has no commands.");
    },
    async () => {},
    previous,
  );
  assert.equal(result.editions.length, 2);
  assert.equal(result.editions[1].article.slug, "reading-the-benchmark");
});

test("publisher-requested reviews can create verified revisions without overriding the review verdict", async () => {
  const h = harness();
  try {
    await h.api(
      "/api/runner/check",
      {
        ...worker,
        catalog: [
          {
            id: "quick-start",
            kind: "docs",
            title: "Quick start",
            version: "0.1.0",
          },
        ],
      },
      true,
    );
    const request = {
      requestId: crypto.randomUUID(),
      articleId: "quick-start",
    };
    const task = await (
      await h.api("/api/publisher/review", request, false, true)
    ).json();
    const claim = await (await h.api("/api/runner/claim", worker, true)).json();
    const result = publicationResult(task.id);
    result.editions[0].review = {
      verdict: "revise",
      findings: ["Match the new execution platform."],
      checkedSourceIds: ["readme"],
    };
    await h.api(
      `/api/runner/tasks/${task.id}`,
      { leaseToken: claim.leaseToken, stage: "complete", result },
      true,
    );
    const revision = { requestId: crypto.randomUUID(), taskId: task.id };
    assert.equal(
      (await h.api("/api/publisher/revise", revision, true)).status,
      404,
    );
    const next = await (
      await h.api("/api/publisher/revise", revision, false, true)
    ).json();
    const duplicate = await (
      await h.api("/api/publisher/revise", revision, false, true)
    ).json();
    assert.equal(next.id, duplicate.id);
    assert.equal(next.parentId, task.id);
    assert.equal(next.role, "manual-writer");
    assert.equal(next.status, "queued");
    assert.equal(
      (await (await h.api(`/api/admin/tasks/${task.id}`)).json()).task.status,
      "needs_revision",
    );
    assert.equal(
      (
        await h.api(
          "/api/publisher/revise",
          { requestId: crypto.randomUUID(), taskId: next.id },
          false,
          true,
        )
      ).status,
      409,
    );
    assert.equal(h.store.workStatus().publications, 0);
  } finally {
    h.sqlite.close();
  }
});
