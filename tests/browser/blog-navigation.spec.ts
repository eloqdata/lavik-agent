import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { articles } from "../../packages/content/repository.ts";
import { blogTopics } from "../../packages/blog/topics.ts";

const legacyPresentation = JSON.parse(
  fs.readFileSync("content/blog-presentation.json", "utf8"),
) as Record<string, { topics: string[] }>;

test("blog covers, recent posts and topic filters work in both languages", async ({
  page,
  request,
}) => {
  let englishCovers: string[] = [];
  for (const locale of ["en", "zh-CN"]) {
    const posts = articles().filter(
      (article) => article.kind === "blog" && article.locale === locale,
    );
    expect(posts.length).toBeGreaterThan(0);
    await page.goto(`/${locale}/blog/`);
    await expect(page.locator(".blog-card")).toHaveCount(posts.length);
    expect(
      await page
        .locator(".blog-card-link")
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href")!).sort(),
        ),
    ).toEqual(
      posts.map((article) => `/${locale}/blog/${article.slug}/`).sort(),
    );
    await expect(page.locator(".blog-recent a")).toHaveCount(5);
    await expect(page.locator(".blog-topics a")).toHaveCount(5);
    const covers = await page
      .locator(".blog-card img")
      .evaluateAll((imgs) =>
        imgs.map((img) => img.getAttribute("src")!).sort(),
      );
    expect(covers).toEqual(
      posts.map((article) => `/blog-covers/${article.id}.svg`).sort(),
    );
    expect(new Set(covers).size).toBe(posts.length);
    if (locale === "en") {
      englishCovers = covers;
      for (const cover of covers) {
        const response = await request.get(cover);
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain("image/svg+xml");
      }
    } else expect(covers).toEqual(englishCovers);
    for (const img of await page.locator(".blog-card img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          img.evaluate((node) => (node as HTMLImageElement).naturalWidth),
        )
        .toBe(1200);
    }
    for (const { id: topic } of blogTopics) {
      const expectedPosts = posts.filter((article) =>
        (
          article.topics ??
          legacyPresentation[article.id]?.topics ??
          []
        ).includes(topic),
      );
      const count = expectedPosts.length;
      await page
        .locator(`.blog-topics a[href="/${locale}/blog/topic/${topic}/"]`)
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/blog/topic/${topic}/$`),
      );
      await expect(page.locator(".blog-card")).toHaveCount(count);
      expect(
        await page
          .locator(".blog-card-link")
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href")!).sort(),
          ),
      ).toEqual(
        expectedPosts
          .map((article) => `/${locale}/blog/${article.slug}/`)
          .sort(),
      );
      await expect(
        page.locator(".blog-topics a[aria-current=page]"),
      ).toHaveAttribute("href", `/${locale}/blog/topic/${topic}/`);
      if (!count)
        await expect(page.locator(".blog-empty a")).toHaveAttribute(
          "href",
          `/${locale}/blog/`,
        );
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://lavik.dev/${locale}/blog/topic/${topic}/`,
      );
      expect(
        (await request.get(`/${locale}/blog/topic/${topic}/`)).status(),
      ).toBe(200);
    }
    await page.locator(".blog-all-posts").click();
    const firstImage = await page
      .locator(".blog-card img")
      .first()
      .getAttribute("src");
    await page.locator(".blog-card-link").first().click();
    await expect(page.locator(".blog-detail .blog-cover")).toHaveAttribute(
      "src",
      firstImage!,
    );
    await expect(page.locator(".blog-sidebar")).toBeVisible();
    await expect(page.locator(".docs-sidebar")).toHaveCount(0);
  }
});

test("mobile blog navigation preserves Recent and Topics without horizontal overflow", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    for (const width of [375, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/blog/`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(page.locator(".blog-topics")).toBeVisible();
      if (width === 375) {
        await page.locator(".blog-recent-mobile summary").click();
        await expect(page.locator(".blog-recent-mobile a")).toHaveCount(5);
        await expect(
          page.locator(".blog-recent-mobile a").first(),
        ).toBeVisible();
      }
    }
  }
});
