import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { articles, articlePath } from "../../packages/content/repository";

test("both languages, benchmark interaction, and real verification output", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const locale of ["en", "zh-CN"]) {
    for (const section of ["", "benchmarks/"]) {
      await page.goto(`/${locale}/${section}`);
      for (const [command, expected] of [
        [
          "GET",
          [
            ["Lavik 0.1.0 SPDK", "1,012,180", "3.599"],
            ["Redis 8.8.0", "976,801", "4.671"],
            ["Valkey 9.1.0", "965,697", "4.543"],
          ],
        ],
        [
          "SET",
          [
            ["Lavik 0.1.0 SPDK", "930,465", "4.799"],
            ["Redis 8.8.0", "910,426", "4.831"],
            ["Valkey 9.1.0", "802,519", "4.383"],
          ],
        ],
      ] as const) {
        await page.getByRole("button", { name: command, exact: true }).click();
        for (const [index, [name, qps, p99]] of expected.entries()) {
          const row = page.locator(".chart-row").nth(index);
          await expect(row).toContainText(name);
          await expect(row).toContainText(qps);
          await expect(row).toContainText(`p99 ${p99} ms`);
        }
      }
      await expect(page.locator(".lavik-bar")).toHaveCount(1);
      if (!section) {
        await expect(page.locator(".large-stat")).toHaveText("1.01M");
        await expect(page.locator(".hero h1")).toContainText("20");
        await expect(page.locator(".capacity-saving")).toContainText("95%");
        await expect(page.locator(".capacity-assumption")).toContainText(
          "20:1",
        );
        await expect(page.locator(".hero .button.secondary")).toHaveAttribute(
          "href",
          `/${locale}/cost/`,
        );
        await expect(page.locator(".benchmark-context a")).toHaveAttribute(
          "href",
          /lavik-v0\.1\.0-beta\.1-spdk-vs-peers-2026-09-18/,
        );
      }
    }
  }
  await page.goto("/en/");
  await fs.mkdir(".cache/screenshots", { recursive: true });
  await page.screenshot({
    path: ".cache/screenshots/home-en.png",
    fullPage: true,
  });
  await page.goto("/en/docs/0.1.0/quick-start/");
  await page.getByText("View actual execution record").click();
  await expect(page.locator(".verification")).toContainText(
    '"gracefulRestart": "passed"',
  );
  await page
    .getByRole("link", { name: "Switch to Simplified Chinese" })
    .click();
  await expect(page).toHaveURL(/\/zh-CN\/docs\/0.1.0\/quick-start\//);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("h1")).toContainText("运行第一组命令");
  expect(errors).toEqual([]);
});
test("cost scenarios recalculate rather than promise a fixed deployment saving", async ({
  page,
}) => {
  await page.goto("/en/cost/");
  await expect(page.locator(".calculator-result>strong")).toContainText("6.47");
  await page.locator("#index-share").fill("0");
  await page.locator("#shared-cost").fill("0");
  await expect(page.locator(".calculator-result>strong")).toContainText(
    "20.00",
  );
  await expect(page.locator(".calculator-result")).toContainText("95.0%");
});
test("all public pages and internal links resolve", async ({ request }) => {
  const routes = [
    ...articles().map(articlePath),
    ...["en", "zh-CN"].flatMap((locale) =>
      ["", "benchmarks/", "cost/", "blog/", "releases/", "use-cases/"].map(
        (section) => `/${locale}/${section}`,
      ),
    ),
  ];
  const links = new Set<string>();
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    for (const match of (await response.text()).matchAll(/href="(\/[^"#?]*)"/g))
      if (!match[1].startsWith("/_next/")) links.add(match[1]);
  }
  for (const link of links)
    expect((await request.get(link)).status(), link).toBe(200);
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
});
test("English and Chinese pages fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const locale of ["en", "zh-CN"])
    for (const route of [
      "",
      "docs/0.1.0/quick-start/",
      "benchmarks/",
      "cost/",
    ]) {
      await page.goto(`/${locale}/${route}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${locale}/${route}`,
      ).toBe(true);
    }
  await page.goto("/zh-CN/");
  await page.screenshot({
    path: ".cache/screenshots/home-zh-mobile.png",
    fullPage: true,
  });
});
