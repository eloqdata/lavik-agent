import { test, expect } from "@playwright/test";
import fs from "node:fs";
const reports = [
  ["2vcpu-capacity", "lavik-v0.2.0-vs-memory-databases-2026-10-21"],
  ["redis-valkey", "lavik-v0.2.0-vs-memory-databases-2026-10-21"],
  ["1tb-storage", "lavik-v0.2.0-storage-peers-1tb-2026-10-21"],
  ["aerospike-ycsb", "lavik-v0.2.0-aerospike-ycsb-2026-10-21"],
];
test("Benchmarks shares Compare menu styling, closes accessibly, and navigates to each topic", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto("/" + locale + "/");
    const trigger = page.locator(".benchmarks-menu button");
    await trigger.click();
    await expect(page.locator(".benchmarks-panel")).toBeVisible();
    expect(
      await page
        .locator(".benchmarks-panel")
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).not.toBe("rgba(0, 0, 0, 0)");
    for (const [id] of reports)
      await expect(
        page.locator(
          '.benchmarks-panel a[href="/' + locale + "/benchmarks/" + id + '/"]',
        ),
      ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await page.mouse.click(2, 2);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 375, height: 950 });
    await trigger.click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(
        '.benchmarks-panel a[href="/' +
          locale +
          '/benchmarks/2vcpu-capacity/"]',
      )
      .click();
    await expect(page).toHaveURL(
      new RegExp("/" + locale + "/benchmarks/2vcpu-capacity/"),
    );
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await page.setViewportSize({ width: 1440, height: 950 });
  }
});
test("every benchmark renders its scoped source commands, original graphs, local assets and responsive tables", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const locale of ["en", "zh-CN"])
    for (const [id, dir] of reports) {
      const route = "/" + locale + "/benchmarks/" + id + "/";
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        "https://lavik.dev" + route,
      );
      const original = fs.readFileSync(
        "evidence/benchmarks/0.2.0/" +
          dir +
          "/" +
          (locale === "en" ? "README.md" : "README.zh-CN.md"),
        "utf8",
      );
      const fence = String.fromCharCode(96).repeat(3),
        pattern = new RegExp(fence + "[^\\n]*\\n([\\s\\S]*?)" + fence, "g");
      const smallStart = original.indexOf("\n### 2 vCPU\n"),
        largeStart = original.indexOf("\n### 16 vCPU / 10M\n");
      if (id === "2vcpu-capacity" || id === "redis-valkey") {
        expect(smallStart).toBeGreaterThanOrEqual(0);
        expect(largeStart).toBeGreaterThan(smallStart);
      }
      const scoped =
        id === "2vcpu-capacity"
          ? original.slice(smallStart, largeStart)
          : id === "redis-valkey"
            ? original.slice(largeStart)
            : original;
      const expected = [...scoped.matchAll(pattern)].map((m) => m[1].trimEnd());
      expect(
        (await page.locator(".benchmark-code pre code").allTextContents()).map(
          (s) => s.trimEnd(),
        ),
      ).toEqual(expected);
      expect(
        await page.locator(".benchmark-original-chart img").count(),
      ).toBeGreaterThan(0);
      for (const img of await page
        .locator(".benchmark-original-chart img")
        .all()) {
        const src = await img.getAttribute("src");
        expect(src).toMatch(/^\/benchmark-assets\/0\.2\.0\//);
        expect((await request.get(src!)).status()).toBe(200);
        await img.scrollIntoViewIfNeeded();
        await expect
          .poll(() => img.evaluate((e) => (e as HTMLImageElement).naturalWidth))
          .toBeGreaterThan(0);
      }
      for (const link of await page
        .locator(".benchmark-toc nav")
        .first()
        .locator("a")
        .all()) {
        const target = await link.getAttribute("href");
        expect(
          await page.locator('[id="' + target!.slice(1) + '"]').count(),
        ).toBe(1);
      }
      for (const width of [375, 820, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          route + " at " + width,
        ).toBe(true);
      }
    }
  expect(errors).toEqual([]);
});
test("matched-concurrency chart switches operation and latency, with all numbers available without JS", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("/en/benchmarks/1tb-storage/");
  const snapshot = page.locator(".benchmark-snapshot");
  await snapshot.getByRole("button", { name: "SET", exact: true }).click();
  await expect(snapshot.locator(".benchmark-bar-row").first()).toContainText(
    "701,241",
  );
  await snapshot.getByRole("button", { name: "p99.9", exact: true }).click();
  await expect(snapshot.locator(".benchmark-bar-row").first()).toContainText(
    "0.959",
  );
  await expect(snapshot.locator(".benchmark-axis")).toContainText(
    "lower is better",
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  const reader = await context.newPage();
  await reader.goto(baseURL + "/en/benchmarks/1tb-storage/");
  await expect(reader.locator(".benchmark-snapshot table")).toContainText(
    "652,881",
  );
  await expect(reader.locator(".benchmark-snapshot table")).toContainText(
    "701,241",
  );
  await expect(reader.locator(".benchmark-context")).toContainText(
    "Garnet leads GET at 160 connections",
  );
  expect(await reader.locator(".benchmark-code").count()).toBeGreaterThan(5);
  await context.close();
});

test("high-throughput report presents raw peaks and exact paired latency in both languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/benchmarks/redis-valkey/`);
    const snapshot = page.locator(".benchmark-snapshot");
    await expect(snapshot.locator("table tbody tr")).toHaveCount(3);
    for (const value of [
      "1,156,956",
      "945,384",
      "976,087",
      "863,860",
      "913,756",
      "793,809",
      "7.103",
      "7.391",
      "7.743",
    ])
      await expect(snapshot.locator("table")).toContainText(value);
    await expect(snapshot).not.toContainText("≈");
    await expect(
      page.locator('.benchmark-actions a[href*="lavik-agent/tree/"]'),
    ).toHaveCount(1);
    await snapshot.getByRole("button", { name: "SET", exact: true }).click();
    await expect(snapshot.locator(".benchmark-bar-row").first()).toContainText(
      "945,384",
    );
  }
});

test("memory benchmark pages and procedure downloads contain only their server CPU configuration", async ({
  page,
  request,
}) => {
  for (const locale of ["en", "zh-CN"])
    for (const [id, cpu, other] of [
      ["2vcpu-capacity", "2", "16"],
      ["redis-valkey", "16", "2"],
    ]) {
      await page.goto(`/${locale}/benchmarks/${id}/`);
      const report = page.locator(".benchmark-report");
      await expect(
        report.locator("h2").filter({ hasText: new RegExp(`^${cpu} vCPU`) }),
      ).toHaveCount(1);
      await expect(
        report
          .locator("h2, h3")
          .filter({ hasText: new RegExp(`^${other} vCPU`) }),
      ).toHaveCount(0);
      await expect(report.locator("img")).toHaveCount(2);
      for (const image of await report.locator("img").all())
        expect(await image.getAttribute("src")).toContain(`/${cpu}vcpu-`);
      const file = locale === "en" ? "README.md" : "README.zh-CN.md";
      const response = await request.get(
        `/benchmark-assets/0.2.0/${id}/${file}`,
      );
      expect(response.ok()).toBe(true);
      const text = await response.text();
      expect(text).toContain(`${cpu}vcpu-combined.svg`);
      expect(text).not.toContain(`${other}vcpu-`);
      expect(text).not.toMatch(new RegExp(`^#{2,3} ${other} vCPU`, "m"));
    }
});
