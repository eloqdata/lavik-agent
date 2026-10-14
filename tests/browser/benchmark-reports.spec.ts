import { test, expect } from "@playwright/test";
import fs from "node:fs";
const reports = [
  ["2vcpu-capacity", "lavik-v0.1.0-2vcpu-latest-capacity-2026-10-13"],
  ["redis-valkey", "lavik-v0.1.0-spdk-vs-latest-2026-10-13"],
  ["1tb-storage", "lavik-v0.1.0-storage-peers-1tb-2026-10-14"],
  ["aerospike-ycsb", "lavik-v0.1.0-aerospike-ycsb-2026-10-13"],
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
test("every benchmark renders complete source commands, original graphs, local assets and responsive tables", async ({
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
        "evidence/benchmarks/0.1.0/" +
          dir +
          "/" +
          (locale === "en" ? "README.md" : "README.zh-CN.md"),
        "utf8",
      );
      const fence = String.fromCharCode(96).repeat(3),
        pattern = new RegExp(fence + "[^\\n]*\\n([\\s\\S]*?)" + fence, "g");
      const expected = [...original.matchAll(pattern)].map((m) =>
        m[1].trimEnd(),
      );
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
        expect(src).toMatch(/^\/benchmark-assets\/0\.1\.0\//);
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
    "425,907",
  );
  await snapshot.getByRole("button", { name: "p99.9", exact: true }).click();
  await expect(snapshot.locator(".benchmark-bar-row").first()).toContainText(
    "2.655",
  );
  await expect(snapshot.locator(".benchmark-axis")).toContainText(
    "lower is better",
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  const reader = await context.newPage();
  await reader.goto(baseURL + "/en/benchmarks/1tb-storage/");
  await expect(reader.locator(".benchmark-snapshot table")).toContainText(
    "385,514",
  );
  await expect(reader.locator(".benchmark-snapshot table")).toContainText(
    "425,907",
  );
  await expect(reader.locator(".benchmark-context")).toContainText("900,794");
  expect(await reader.locator(".benchmark-code").count()).toBeGreaterThan(5);
  await context.close();
});
