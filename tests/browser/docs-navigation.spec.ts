import { test, expect } from "@playwright/test";
const names = [
  "Get Started",
  "Build With Lavik",
  "Managing Lavik",
  "Migrating To Lavik",
  "Understand & Evaluate",
];
test("docs categories collapse, expand by keyboard, preserve active location and search across hidden groups", async ({
  page,
}) => {
  await page.goto("/en/docs/0.1.0/");
  const categories = page.locator(".docs-nav-group");
  expect(await categories.locator("summary").allTextContents()).toEqual(
    names.map((n) => n + "›"),
  );
  await expect(page.locator(".docs-nav-group[open]")).toHaveCount(0);
  const start = categories.nth(0);
  await start.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(
    start.getByRole("link", { name: "Install With Docker", exact: true }),
  ).toBeVisible();
  await start
    .getByRole("link", { name: "Install With Docker", exact: true })
    .click();
  await expect(page).toHaveURL(/install-docker\/$/);
  await expect(page.locator(".docs-nav-group[open]")).toHaveCount(1);
  await expect(page.locator(".docs-nav-group a[aria-current=page]")).toHaveText(
    "Install With Docker",
  );
  await page.locator(".docs-sidebar input").fill("From Redis Cluster");
  await page.locator(".docs-search-results a").first().click();
  await expect(page).toHaveURL(/migrate-redis-cluster\/$/);
  await expect(page.locator(".docs-nav-group[open] summary")).toContainText(
    "Migrating To Lavik",
  );
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/zh-CN/docs/0.1.0/");
  await page.getByRole("button", { name: "文档目录" }).click();
  await page
    .locator(".docs-nav-group summary")
    .filter({ hasText: "开始使用" })
    .click();
  await expect(
    page
      .getByRole("link", { name: "使用 Docker Compose 安装", exact: true })
      .first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("user documentation exposes complete guides without internal audit sections", async ({
  page,
  request,
}) => {
  const manifest = await (await request.get("/manual-manifest.json")).json();
  expect(manifest.userGuides).toHaveLength(10);
  for (const locale of ["en", "zh-CN"])
    for (const route of [
      "install-packages",
      "install-docker",
      "install-docker-compose",
      "migrate-redis",
      "migrate-redis-cluster",
      "quick-start",
      "lavik-ctl-single-node",
      "lavik-ctl-ha-cluster",
      "commands/get",
      "clients/valkey-go",
    ]) {
      await page.goto(`/${locale}/docs/0.1.0/${route}/`);
      await expect(page.locator("h1")).not.toBeEmpty();
      await expect(
        page.locator(
          ".operations-evidence,.source-list,.quick-start-verification,.recipe .verification",
        ),
      ).toHaveCount(0);
      await expect(page.locator("article")).not.toContainText(
        "Verification scope",
      );
      await expect(page.locator("article")).not.toContainText(
        "Test environment & reproducible evidence",
      );
    }
  await page.goto("/en/docs/0.1.0/migrate-redis-cluster/");
  await expect(page.locator("article")).toContainText("ADDREPLICAOF");
  await expect(page.locator("article")).toContainText("LOADING");
  await expect(page.locator("article")).toContainText("standalone");
});

test("official Docker installation snippets copy correctly in both languages", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/docs/0.1.0/install-docker/`);
    await expect(page.locator("#start pre")).toContainText(
      "docker pull eloqdata/lavik:0.1.0-beta.1",
    );
    await page.locator("#start button").click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      "-v lavik-data:/data",
    );
    await page.goto(`/${locale}/docs/0.1.0/install-docker-compose/`);
    await expect(page.locator("#start pre")).toContainText(
      "a1770a78b52e0bb9ec32e20b92af6282e73efabd",
    );
    await expect(page.locator("#connect pre")).toContainText("READONLY");
    await expect(page.locator("#failover pre")).toContainText(
      "lavik-ctl failover group-1",
    );
    await expect(page.locator("#restart pre")).toContainText(
      "docker compose down --timeout 60",
    );
    await expect(page.locator("#restart pre")).not.toContainText("--volumes");
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("package guide exposes signed APT and service commands in both languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/docs/0.1.0/install-packages/`);
    await expect(page.locator("#install pre")).toContainText(
      "Signed-By: /etc/apt/keyrings/lavik.asc",
    );
    await expect(page.locator("#install pre")).toContainText(
      "lavik=0.1.0~beta.1-1",
    );
    await expect(page.locator("#standard pre")).toContainText(
      "lavik-standard=0.1.0~beta.1-1",
    );
    await expect(page.locator("#start pre")).toContainText(
      "systemctl enable --now lavik",
    );
    await expect(
      page.locator(".docs-nav-group a[aria-current=page]"),
    ).toBeVisible();
    await page.setViewportSize({ width: 375, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
