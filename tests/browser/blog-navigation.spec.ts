import { test, expect } from "@playwright/test";

test("blog covers, recent posts and topic filters work in both languages", async ({
  page,
  request,
}) => {
  let englishCovers: string[] = [];
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/blog/`);
    await expect(page.locator(".blog-card")).toHaveCount(10);
    await expect(page.locator(".blog-recent a")).toHaveCount(5);
    await expect(page.locator(".blog-topics a")).toHaveCount(5);
    const covers = await page
      .locator(".blog-card img")
      .evaluateAll((imgs) =>
        imgs.map((img) => img.getAttribute("src")!).sort(),
      );
    expect(new Set(covers).size).toBe(10);
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
    for (const [topic, count] of [
      ["architecture", 8],
      ["benchmark", 2],
      ["use-case", 0],
      ["best-practise", 1],
      ["news", 0],
    ] as const) {
      await page
        .locator(`.blog-topics a[href="/${locale}/blog/topic/${topic}/"]`)
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/${locale}/blog/topic/${topic}/$`),
      );
      await expect(page.locator(".blog-card")).toHaveCount(count);
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
