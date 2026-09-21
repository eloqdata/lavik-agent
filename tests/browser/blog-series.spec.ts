import { test, expect } from "@playwright/test";
import fs from "node:fs";
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
    await expect(list.locator("time").first()).toHaveText("2026-09-21");
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
