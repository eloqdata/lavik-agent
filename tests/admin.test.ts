import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import { TaskStore, type Database } from "../packages/admin/store.ts";
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

test("production worker keeps public pages available and fails closed before Access is configured", async () => {
  let storeCalls = 0;
  const env = {
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
  const api = async (path: string, body?: unknown, runner = false) =>
    store.fetch(
      new Request(`https://lavik.dev${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "X-Admin-Actor": "owner@example.test",
          ...(runner ? { "X-Runner-Authorized": "true" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { db, sqlite, api };
}
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
    assert.ok(input.feedback.includes("State prerequisites."));
    return write(input, verify);
  };
  runtime.review = async (article, receipts) => {
    reviews++;
    assert.equal(article.kind, "docs");
    assert.equal(receipts[0].status, "passed");
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
