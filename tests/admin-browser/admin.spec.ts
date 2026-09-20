import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import {
  articles,
  contentHash,
  knowledgeHash,
  release,
  renderingHash,
} from "../../packages/content/repository";

const runnerToken = "local-test-runner-token-with-at-least-32-characters";
const origin = "http://127.0.0.1:4174";
test("admin persists tasks, displays worker progress, saves feedback and preserves revisions", async ({
  page,
  request,
}) => {
  const adminHeaders = { Origin: origin };
  const runnerHeaders = { Authorization: `Bearer ${runnerToken}` };
  const dashboard = await (await request.get("/api/admin/dashboard")).json();
  for (const task of dashboard.tasks)
    if (["queued", "running"].includes(task.status))
      await request.post(`/api/admin/tasks/${task.id}/cancel`, {
        headers: adminHeaders,
        data: {},
      });
  const catalog = articles()
    .filter((a) => a.locale === "en" && ["docs", "blog"].includes(a.kind))
    .map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      version: a.version,
    }));
  const worker = {
    runnerId: "browser-test-worker",
    model: "test-writer",
    reviewerModel: "test-reviewer",
    catalog,
  };
  expect(
    (
      await request.post("/api/runner/claim", {
        headers: runnerHeaders,
        data: worker,
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/admin/");
  for (const name of [
    "User manual writer",
    "Blog writer",
    "User manual reviewer",
    "Blog reviewer",
  ])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await page
    .getByRole("button", { name: "+ Assign a task", exact: true })
    .click();
  await page.getByLabel("Agent", { exact: true }).selectOption("manual-writer");
  await page
    .getByLabel("Existing article (optional)")
    .selectOption("quick-start");
  const title = `Test manual task ${Date.now()}`;
  await page.getByLabel("Task title").fill(title);
  await page
    .getByLabel("Brief", { exact: true })
    .fill("Review the prerequisites and explain the first verified commands.");
  let lostResponse = false;
  await page.route("**/api/admin/tasks", async (route) => {
    const response = await route.fetch();
    if (!lostResponse) {
      lostResponse = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Test: response lost after commit" }),
      });
    } else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Queue task →" }).click();
  await expect(page.locator(".admin-alert")).toContainText(
    "response lost after commit",
  );
  await page.getByRole("button", { name: "Queue task →" }).click();
  await expect(page.getByRole("status")).toContainText("Task queued");
  const afterRetry = await (await request.get("/api/admin/dashboard")).json();
  expect(
    afterRetry.tasks.filter((task: { title: string }) => task.title === title),
  ).toHaveLength(1);
  await page.unroute("**/api/admin/tasks");
  await page.reload();
  await page.locator(".task-row").filter({ hasText: title }).click();
  await expect(page.locator(".task-title")).toHaveText(title);
  const claim = await (
    await request.post("/api/runner/claim", {
      headers: runnerHeaders,
      data: worker,
    })
  ).json();
  expect(claim.task.title).toBe(title);
  await request.post(`/api/runner/tasks/${claim.task.id}`, {
    headers: runnerHeaders,
    data: {
      leaseToken: claim.leaseToken,
      stage: "Writing en",
      activeRole: "manual-writer",
    },
  });
  await expect(
    page.locator(".agent-card").filter({ hasText: "User manual writer" }),
  ).toContainText("Working");
  await page
    .getByLabel("Feedback", { exact: true })
    .fill("Make the prerequisites easier to follow.");
  await page
    .getByRole("button", { name: "Save feedback", exact: true })
    .click();
  await expect(page.locator(".task-history")).toContainText(
    "Make the prerequisites easier to follow.",
  );
  const editions = ["en", "zh-CN"].map((locale) => {
    const article = structuredClone(
      articles().find((a) => a.id === "quick-start" && a.locale === locale)!,
    );
    article.blocks = [
      {
        type: "paragraph" as const,
        text: locale === "en" ? "A browser test draft." : "浏览器测试草稿。",
        sources: ["readme"],
      },
    ];
    return {
      article,
      contentHash: contentHash(article),
      renderingHash: renderingHash(),
      receipts: [],
      review: { verdict: "pass", findings: [], checkedSourceIds: ["readme"] },
    };
  });
  const result = {
    editions,
    runtime: "browser-test",
    knowledgeHash: knowledgeHash(),
    sourceCommit: release.commit,
    completedAt: new Date().toISOString(),
  };
  expect(
    (
      await request.post(`/api/runner/tasks/${claim.task.id}`, {
        headers: runnerHeaders,
        data: { leaseToken: claim.leaseToken, stage: "complete", result },
      })
    ).ok(),
  ).toBeTruthy();
  await expect(page.locator(".task-detail > .task-status")).toHaveText(
    "Review passed",
  );
  await expect(page.locator(".draft-preview")).toContainText(
    "A browser test draft.",
  );
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(page.locator(".draft-preview")).toContainText(
    "浏览器测试草稿。",
  );
  await fs.mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({
    path: ".cache/screenshots/admin-desktop.png",
    fullPage: true,
  });
  await page
    .getByLabel("Feedback", { exact: true })
    .fill("Add a clearer next step.");
  await page
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("new attempt");
  await expect(
    page.getByRole("button", { name: "View previous attempt" }),
  ).toBeVisible();
  const next = await (
    await request.post("/api/runner/claim", {
      headers: runnerHeaders,
      data: worker,
    })
  ).json();
  expect(next.task.parentId).toBe(claim.task.id);
  expect(next.feedback).toContain("Make the prerequisites easier to follow.");
  expect(next.feedback).toContain("Add a clearer next step.");
  expect(next.previous.editions).toHaveLength(2);
  await request.post(`/api/admin/tasks/${next.task.id}/cancel`, {
    headers: adminHeaders,
    data: {},
  });
  const stale = await request.post(`/api/runner/tasks/${next.task.id}`, {
    headers: runnerHeaders,
    data: { leaseToken: next.leaseToken, stage: "complete", result },
  });
  expect(stale.status()).toBe(409);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: ".cache/screenshots/admin-mobile.png",
    fullPage: true,
  });
});
test("admin rejects cross-origin mutations and unauthenticated worker calls", async ({
  request,
}) => {
  const response = await request.post("/api/admin/tasks", {
    headers: { Origin: "https://attacker.test" },
    data: {
      requestId: crypto.randomUUID(),
      role: "blog-writer",
      title: "Forged task",
      brief: "An unwanted writing task.",
    },
  });
  expect(response.status()).toBe(403);
  expect((await request.post("/api/runner/claim", { data: {} })).status()).toBe(
    401,
  );
  const invalid = await request.post("/api/admin/tasks", {
    headers: { Origin: origin },
    data: {
      requestId: crypto.randomUUID(),
      role: "publisher",
      title: "Invalid task",
      brief: "This role is not connected.",
    },
  });
  expect(invalid.status()).toBe(400);
});
