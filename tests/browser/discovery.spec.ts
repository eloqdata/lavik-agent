import { test, expect } from "@playwright/test";

test("search readers receive both benchmark operations and complete metadata without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${baseURL}/en/benchmarks/`);
  await expect(page.locator(".benchmark-data")).toContainText("930,465");
  await expect(page.locator(".benchmark-data")).toContainText("1,012,180");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://lavik.dev/en/benchmarks/",
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/social\/lavik\.png$/,
  );
  expect(
    await page.locator('script[type="application/ld+json"]').count(),
  ).toBeGreaterThan(0);
  await context.close();
});

test("production tracker preserves campaign attribution, counts versioned install pages, and honors opt-out", async ({
  page,
  request,
  baseURL,
}) => {
  const events: { event: string; source: string; path: string }[] = [];
  await page.clock.install();
  // Route every production-origin request to local files or this event sink.
  // No request from this test reaches production analytics.
  await page.route("https://lavik.dev/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/analytics/event") {
      events.push(route.request().postDataJSON());
      await route.fulfill({ status: 204 });
    } else {
      const response = await request.get(
        `${baseURL}${url.pathname}${url.search}`,
      );
      await route.fulfill({ response });
    }
  });
  await page.goto(
    "https://lavik.dev/en/?utm_source=wechat&utm_medium=social&utm_campaign=why-lavik-separates-index-from-values",
  );
  await expect
    .poll(() => events.filter((e) => e.event === "visit").length)
    .toBe(1);
  await page.evaluate(() =>
    history.pushState(
      null,
      "",
      "/en/?utm_source=medium&utm_medium=referral&utm_campaign=reading-benchmarks",
    ),
  );
  await expect
    .poll(() => events.filter((e) => e.event === "visit").length)
    .toBe(2);
  await page.goto("https://lavik.dev/en/docs/0.1.0/install-docker/");
  await expect
    .poll(() => events.filter((e) => e.event === "install").length)
    .toBe(1);
  expect(events.find((e) => e.event === "visit")?.source).toBe("wechat");
  expect(events.find((e) => e.event === "install")?.source).toBe("medium");
  expect(events.filter((e) => e.event === "visit")).toHaveLength(2);
  await page.goto("https://lavik.dev/en/privacy/");
  await page
    .getByRole("button", { name: "Disable analytics / 退出统计" })
    .click();
  await expect(
    page.getByRole("button", { name: "Enable analytics / 启用统计" }),
  ).toBeVisible();
  const before = events.length;
  await page.clock.fastForward(25_000);
  expect(
    await page.evaluate(() => sessionStorage.getItem("lavik.visit.v1")),
  ).toBeNull();
  expect(events).toHaveLength(before);
  await page.goto("https://lavik.dev/en/download/");
  await page.waitForLoadState("networkidle");
  expect(events).toHaveLength(before);
});
