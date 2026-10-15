import { test, expect } from "@playwright/test";
import fs from "node:fs";
const stableRelease = JSON.parse(
  fs.readFileSync("content/docs/0.1.0/release.json", "utf8"),
);
const revision = "9d6b212da5da820b4bed63fc047b5c2ed6be1fa5";
const pages = ["en", "zh-CN"].flatMap((locale) =>
  fs
    .readdirSync(`content/${locale}`)
    .filter((name) => name.endsWith(".json"))
    .map((name) =>
      JSON.parse(fs.readFileSync(`content/${locale}/${name}`, "utf8")),
    )
    .filter((article) => article.sourceRevision === revision),
);

test("eight bilingual engineering articles are discoverable and show their current source revision", async ({
  page,
  request,
}) => {
  expect(pages).toHaveLength(16);
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/blog/`);
    const list = page.locator(".article-list");
    for (const article of pages.filter((a) => a.locale === locale))
      await expect(
        list.getByRole("link", {
          name: new RegExp(
            article.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          ),
        }),
      ).toBeVisible();
    const dates = await list.locator("time").allTextContents();
    expect(dates).toEqual([...dates].sort().reverse());
  }
  for (const article of pages) {
    const route = `/${article.locale}/blog/${article.slug}/`;
    expect((await request.get(route)).status()).toBe(200);
    await page.goto(route);
    await expect(page.locator("h1")).toHaveText(article.title);
    await expect(page.locator(".article-meta")).toContainText(
      revision.slice(0, 7),
    );
    await expect(page.locator(".article-meta")).not.toContainText(
      "v0.1.0-beta.1",
    );
    await expect(page.locator(".source-list a").first()).toHaveAttribute(
      "href",
      `https://github.com/eloqdata/lavik/tree/${revision}`,
    );
    for (const link of await page.locator(".source-list li a").all())
      expect(await link.getAttribute("href")).toContain(`/blob/${revision}/`);
    for (const width of [375, 820, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}`,
      ).toBe(true);
    }
  }
});

test("stable release announcement links to stable downloads and docs without the legacy beta engineering label", async ({
  page,
  request,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    const article = JSON.parse(
      fs.readFileSync(`content/${locale}/lavik-0-1-0-released.json`, "utf8"),
    );
    await page.goto(`/${locale}/blog/${article.slug}/`);
    await expect(page.locator("h1")).toHaveText(article.title);
    await expect(page.locator(".source-list")).not.toContainText(
      "downloadable beta",
    );
    await expect(page.locator(".source-list")).not.toContainText("下载的 beta");
    await expect(page.locator(".source-list a").first()).toHaveAttribute(
      "href",
      `https://github.com/eloqdata/lavik/tree/${article.sourceRevision}`,
    );
    for (const route of [
      "download/",
      "releases/0-1-0/",
      "docs/0.1.0/",
      "docs/0.1.0/migrate-redis/",
    ]) {
      await expect(
        page.locator(`.download-box a[href="/${locale}/${route}"]`),
      ).toBeVisible();
      expect((await request.get(`/${locale}/${route}`)).status()).toBe(200);
    }
    await page.setViewportSize({ width: 375, height: 950 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
