import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { articles, articlePath } from "../../packages/content/repository";

test("both languages, homepage benchmark interaction, and real verification output", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const locale of ["en", "zh-CN"]) {
    for (const section of [""]) {
      await page.goto(`/${locale}/${section}`);
      for (const [command, expected] of [
        [
          "GET",
          [
            ["Lavik 0.1.0 SPDK", "1,145,772", "7.135"],
            ["Redis 8.10.2", "1,018,735", "7.103"],
            ["Valkey 9.1.2", "970,288", "7.455"],
          ],
        ],
        [
          "SET",
          [
            ["Lavik 0.1.0 SPDK", "971,950", "7.199"],
            ["Redis 8.10.2", "951,053", "7.231"],
            ["Valkey 9.1.2", "808,103", "7.199"],
          ],
        ],
      ] as const) {
        await page.getByRole("button", { name: command, exact: true }).click();
        for (const [index, [name, qps, p99]] of expected.entries()) {
          const row = page.locator(".chart-row").nth(index);
          await expect(row).toContainText(name);
          await expect(row).toContainText(qps);
          await expect(row).toContainText(`p99.9 ${p99} ms`);
        }
      }
      await expect(page.locator(".benchmark-chart .lavik-bar")).toHaveCount(1);
      await expect(page.locator(".chart-caption")).toContainText(
        locale === "en" ? "Raw measured results" : "原始测量结果",
      );
      await expect(page.locator(".site-header .version-pill")).toHaveCount(0);
      if (!section) {
        await expect(page.locator("main")).toHaveAttribute(
          "data-homepage",
          "G",
        );
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator("h1")).toContainText("NVMe SSD");
        await expect(page.locator("#dual-cost-title")).toContainText("1/20");
        await expect(page.locator(".dual-cost-row strong")).toHaveText([
          "5%",
          "100%",
          "100%",
        ]);
        for (const [index, width] of ["5%", "100%", "100%"].entries()) {
          await expect(
            page.locator(".dual-cost-row .bar").nth(index),
          ).toHaveAttribute("style", `width:${width}`);
        }
        await expect(page.locator(".dual-source-links a")).toHaveCount(1);
        await expect(page.locator(".dual-chart-label")).toContainText("20:1");
        await expect(page.locator(".dual-chart-label a")).toHaveAttribute(
          "href",
          `/${locale}/cost/`,
        );
        await expect(page.locator(".dual-description")).toContainText(
          locale === "en"
            ? "Our capacity cost is just 1/20 of Redis."
            : "容量成本仅为 Redis 的 1/20。",
        );
        await expect(
          page.locator(".dual-source-links a").first(),
        ).toHaveAttribute("href", /lavik-v0\.1\.0-spdk-vs-latest-2026-10-13/);
        await expect(page.locator(".dual-actions a").first()).toHaveAttribute(
          "href",
          `/${locale}/docs/0.1.0/quick-start/`,
        );
        await expect(page.locator(".prototype-switcher")).toHaveCount(0);
        await page.locator(".dual-method summary").click();
        await expect(page.locator(".dual-method p").first()).toBeVisible();
        await expect(page.locator(".dual-method p").last()).toContainText(
          "20:1",
        );
        await expect(page.locator(".dual-method a").last()).toHaveAttribute(
          "href",
          `/${locale}/cost/`,
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
  await expect(
    page.locator(
      ".recipe .verification, .source-list, .quick-start-verification",
    ),
  ).toHaveCount(0);
  await expect(
    page.locator('[data-doc-example$="binary-start.sh"] pre'),
  ).toContainText("./lavik --bind");
  await page
    .getByRole("link", { name: "Switch to Simplified Chinese" })
    .click();
  await expect(page).toHaveURL(/\/zh-CN\/docs\/0.1.0\/quick-start\//);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.locator("h1")).toContainText("使用二进制安装");
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
      [
        "",
        "benchmarks/",
        "cost/",
        "blog/",
        "releases/",
        "use-cases/",
        "download/",
        "community/",
        "docs/0.1.0/",
      ].map((section) => `/${locale}/${section}`),
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

test("selected homepage is exported without JavaScript and preview queries cannot change it", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const locale of ["en", "zh-CN"]) {
    for (const query of ["", "?variant=A", "?variant=G"]) {
      await page.goto(`${baseURL}/${locale}/${query}`);
      await expect(page.locator("main")).toHaveAttribute("data-homepage", "G");
      await expect(page.locator("h1")).toContainText("Redis");
      await expect(page.locator(".chart-row").first()).toContainText(
        "1,145,772",
      );
      await expect(page.locator(".benchmark-data")).toContainText("971,950");
      await expect(page.locator(".dual-cost-row strong")).toHaveText([
        "5%",
        "100%",
        "100%",
      ]);
      await expect(page.locator(".dual-description")).toContainText(
        locale === "en"
          ? "Our capacity cost is just 1/20 of Redis."
          : "容量成本仅为 Redis 的 1/20。",
      );
      await expect(page.locator(".dual-chart-label")).toContainText("20:1");
      await expect(page.locator(".dual-method")).toContainText(
        locale === "en"
          ? "The model excludes index and runtime memory, replication, servers and operations."
          : "此模型不含索引与运行时内存、复制、服务器及运维成本",
      );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://lavik.dev/${locale}/`,
      );
      expect(
        await page.locator('script[type="application/ld+json"]').count(),
      ).toBeGreaterThan(1);
      await expect(page.locator(".prototype-switcher")).toHaveCount(0);
      await expect(
        page.locator('.home-cluster-svg use[data-node="redis"]'),
      ).toHaveCount(300);
      await expect(
        page.locator('.home-cluster-svg use[data-node="lavik"]'),
      ).toHaveCount(3);
      await expect(page.locator("#home-cluster-caption")).toContainText(
        locale === "en" ? "not a measured migration" : "不是已完成的迁移案例",
      );
      await expect(page.locator(".home-scale-stats")).toContainText(
        "1,069,126",
      );
      await expect(page.locator(".home-agent-result")).toContainText(
        "5.96 TiB",
      );
      await expect(page.locator("#open-source")).toContainText("Apache 2.0");
    }
  }
  await context.close();
});

test("homepage capacity scenario responds to input and links to current migration guidance", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/`);
    const slider = page.getByRole("slider", {
      name: locale === "en" ? "Agents per account" : "每个账户的智能体数量",
    });
    await slider.focus();
    await slider.press("Home");
    await expect(page.locator(".home-agent-result")).toContainText("61.04 GiB");
    await slider.press("End");
    await expect(page.locator(".home-agent-result")).toContainText("11.92 TiB");
    await expect(page.locator(".home-agent-result")).toContainText("200×");
    await expect(page.locator(".home-tail-details a")).toHaveAttribute(
      "href",
      `/${locale}/docs/0.1.0/migrate-redis/`,
    );
    await expect(page.locator(".home-scale-stats")).toContainText("1.024");
    await expect(page.locator(".home-sizing-note")).toContainText(
      locale === "en"
        ? "not a tested 300-to-3 migration"
        : "并非经过测试的 300 到 3 迁移",
    );
    await expect(page.locator(".home-final-cta a")).toHaveAttribute(
      "href",
      `/${locale}/docs/0.1.0/quick-start/`,
    );
  }
});

test("header has no release badge across page types and languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"])
    for (const route of [
      "",
      "docs/0.1.0/",
      "docs/0.1.0-beta.1/",
      "download/",
      "benchmarks/",
      "compare/",
      "blog/",
      "community/",
    ]) {
      await page.goto(`/${locale}/${route}`);
      await expect(page.locator(".site-header .wordmark")).toHaveText("Lavik");
      await expect(page.locator(".site-header .version-pill")).toHaveCount(0);
    }
});
