import { test, expect } from "@playwright/test";
import { articles } from "../../packages/content/repository.ts";

test("featured articles and technical evidence are readable without JavaScript on mobile and desktop", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    for (const locale of ["en", "zh-CN"]) {
      const flagship = articles().find(
        (article) =>
          article.locale === locale &&
          article.id === "300-redis-nodes-to-3-lavik-nodes",
      )!;
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/${locale}/blog/`);
        const expectedRegular = articles()
          .filter(
            (a) => a.locale === locale && a.kind === "blog" && !a.featured,
          )
          .sort(
            (a, b) =>
              b.updatedAt.localeCompare(a.updatedAt) ||
              a.title.localeCompare(b.title),
          );
        expect(
          await page
            .locator(".blog-featured .blog-card-link")
            .getAttribute("href"),
        ).toBe(`/${locale}/blog/300-redis-nodes-to-3-lavik-nodes/`);
        expect(
          await page
            .locator(".blog-feed .blog-card-link")
            .evaluateAll((links) => links.map((a) => a.getAttribute("href"))),
        ).toEqual(expectedRegular.map((a) => `/${locale}/blog/${a.slug}/`));
        await page.locator(".blog-featured .blog-card-link").click();
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.locator(".technical-figure table")).toHaveCount(5);
        await expect(page.locator(".technical-figure img")).toHaveCount(4);
        await expect(page.locator("#peak-results")).toContainText("1,145,772");
        await expect(page.locator("#cost-model")).toContainText("$51,246");
        await expect(page.locator(".technical-toc a")).toHaveCount(
          flagship.blocks.filter((block) => block.type === "heading").length,
        );
        await expect(page.locator(".technical-sources li")).toHaveCount(
          flagship.technical!.sources.length,
        );
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          "href",
          `https://lavik.dev/${locale}/blog/300-redis-nodes-to-3-lavik-nodes/`,
        );
        const graphs = (
          await page
            .locator('script[type="application/ld+json"]')
            .allTextContents()
        ).flatMap((text) => JSON.parse(text)["@graph"] ?? []);
        expect(graphs.some((entry) => entry["@type"] === "BlogPosting")).toBe(
          true,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.locator(".technical-toc a").first().click();
        await expect(page).toHaveURL(/#section-1$/);
      }
    }
  } finally {
    await context.close();
  }
});
