import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("stable migration navigation, search and version switch resolve to the combined RedisShake guide", async ({
  page,
  request,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/docs/0.1.0/migrate-redis/`);
    const migration = page.locator(".docs-nav-group[open]");
    await expect(migration.locator("a")).toHaveCount(1);
    await expect(migration.locator("a")).toHaveAttribute(
      "href",
      `/${locale}/docs/0.1.0/migrate-redis/`,
    );
    await page.locator(".docs-sidebar input").fill("RedisShake");
    await expect(
      page.locator(
        `.docs-search-results a[href="/${locale}/docs/0.1.0/migrate-redis/"]`,
      ),
    ).toBeVisible();
    await expect(page.locator("#redis-cluster pre")).toContainText(
      "cluster = true",
    );
    await page.goto(`/${locale}/docs/0.1.0-beta.1/migrate-redis-cluster/`);
    await page.locator(".doc-version-select select").selectOption("0.1.0");
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/docs/0\\.1\\.0/migrate-redis/$`),
    );
    await expect(page.locator("#install")).toContainText("4.6.2");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`/${locale}/docs/0.1.0/migrate-redis/`);
    expect(sitemap).not.toContain(
      `/${locale}/docs/0.1.0/migrate-redis-cluster/`,
    );
  }
});

test("Docs default to stable and version switching preserves page and language", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/docs/`);
    await expect(page.locator(".doc-version-select select")).toHaveValue(
      "0.2.0",
    );
    await page.goto(`/${locale}/docs/0.1.0/commands/get/`);
    await expect(page.locator("article .article-meta")).toHaveText("v0.1.0");
    await page
      .locator(".doc-version-select select")
      .selectOption("0.1.0-beta.1");
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/docs/0\\.1\\.0-beta\\.1/commands/get/$`),
    );
    await expect(page.locator("article .article-meta")).toHaveText(
      "v0.1.0-beta.1",
    );
    await page.locator(".docs-sidebar input").fill("HREPLACE");
    await expect(
      page.locator(".docs-search-results a").first(),
    ).toHaveAttribute(
      "href",
      new RegExp(
        `^/${locale}/docs/0\\.1\\.0-beta\\.1/commands/lavik\\.hreplace/?$`,
      ),
    );
    await page.locator(".doc-version-select select").selectOption("0.1.0");
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/docs/0\\.1\\.0/commands/get/$`),
    );
  }
  await page.goto("/en/docs/0.1.0/commands/lavik.replicaof/");
  await expect(page.locator("h1")).toHaveText("LAVIK.REPLICAOF");
  await page.locator(".doc-version-select select").selectOption("0.1.0-beta.1");
  await expect(page).toHaveURL(/\/en\/docs\/0\.1\.0-beta\.1\/$/);
});
test("Download defaults to four stable archives and switches to intact beta assets", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/download/`);
    await expect(page.locator(".doc-version-select select")).toHaveValue(
      "0.2.0",
    );
    await expect(page.locator(".download-card")).toHaveCount(4);
    for (const link of await page.locator(".download-card a.button").all())
      await expect(link).toHaveAttribute("href", /\/v0\.2\.0\/lavik-v0\.2\.0-/);
    await page
      .locator(".doc-version-select select")
      .selectOption("0.1.0-beta.1");
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/download/0\\.1\\.0-beta\\.1/$`),
    );
    for (const link of await page.locator(".download-card a.button").all())
      await expect(link).toHaveAttribute("href", /\/v0\.1\.0-beta\.1\//);
    await expect(
      page.locator(".release-banner a.button").first(),
    ).toHaveAttribute("href", `/${locale}/docs/0.1.0-beta.1/quick-start/`);
    await page.locator(".doc-version-select select").selectOption("0.1.0");
    await expect(page).toHaveURL(new RegExp(`/${locale}/download/0\\.1\\.0/$`));
  }
});
test("stable guides expose release-specific startup, packages and release notes", async ({
  page,
  request,
}) => {
  const guides = JSON.parse(
    fs.readFileSync("content/docs/0.1.0/guides.json", "utf8"),
  );
  for (const locale of ["en", "zh-CN"]) {
    for (const guide of guides) {
      await page.goto(`/${locale}/docs/0.1.0/${guide.id}/`);
      await expect(page.locator("h1")).toHaveText(guide.title[locale]);
      for (const section of guide.sections)
        for (const block of section.blocks)
          if (block.type === "code") {
            const expected = fs.readFileSync(block.file, "utf8").trim();
            expect(
              await page
                .locator(`[data-doc-example="${block.file}"] pre code`)
                .count(),
            ).toBeGreaterThan(0);
            for (const rendered of await page
              .locator(`[data-doc-example="${block.file}"] pre code`)
              .all())
              await expect(rendered).toHaveText(expected);
          }
      await page.setViewportSize({ width: 375, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${locale}/${guide.id}`,
      ).toBe(true);
    }
    await page.goto(`/${locale}/releases/`);
    await expect(page.locator(".article-list-item").first()).toHaveAttribute(
      "href",
      `/${locale}/releases/0-2-0/`,
    );
    await page.goto(`/${locale}/releases/0-1-0/`);
    await expect(page.locator("h1")).toHaveText("Lavik 0.1.0");
    await expect(page.locator("article")).toContainText("135");
    await expect(page.locator("#upgrade")).toContainText("--meta-seed");
    expect(
      (await request.get(`/${locale}/releases/0-1-0-beta-1/`)).status(),
    ).toBe(200);
    const feed = await (await request.get(`/${locale}/feed.xml`)).text();
    expect(feed).toContain(`https://lavik.dev/${locale}/releases/0-1-0/`);
  }
});
