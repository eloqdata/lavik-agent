import { test, expect } from "@playwright/test";

test("0.2.0 defaults, preserved versions, current hero and regular release announcement", async ({
  page,
  request,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/`);
    await expect(page.locator(".dual-throughput")).toContainText("Lavik 0.2.0");
    await expect(page.locator(".dual-throughput")).toContainText("1,156,956");
    await page
      .locator(".dual-throughput button")
      .filter({ hasText: "SET" })
      .click();
    await expect(page.locator(".dual-throughput")).toContainText("945,384");
    await page.goto(`/${locale}/docs/`);
    await expect(page.locator(".doc-version-select select")).toHaveValue(
      "0.2.0",
    );
    await page.goto(`/${locale}/docs/0.2.0/commands/get/`);
    await expect(page.locator("h1")).toHaveText("GET");
    await expect(page.locator("article .article-meta")).toHaveText("v0.2.0");
    await page.locator(".doc-version-select select").selectOption("0.1.0");
    await expect(page).toHaveURL(
      new RegExp(`/${locale}/docs/0\\.1\\.0/commands/get/`),
    );
    await expect(page.locator("article .article-meta")).toHaveText("v0.1.0");
    await page.goto(`/${locale}/download/`);
    await expect(page.locator(".doc-version-select select")).toHaveValue(
      "0.2.0",
    );
    await expect(page.locator(".download-card")).toHaveCount(4);
    for (const link of await page.locator(".download-card a.button").all())
      await expect(link).toHaveAttribute("href", /\/v0\.2\.0\//);
    await page.goto(`/${locale}/blog/`);
    const post = `/${locale}/blog/lavik-0-2-0-released/`;
    await expect(page.locator(`.blog-feed a[href="${post}"]`)).toHaveCount(1);
    await expect(page.locator(`.blog-featured a[href="${post}"]`)).toHaveCount(
      0,
    );
    await expect(
      page.locator(".blog-current-release a").first(),
    ).toHaveAttribute("href", post);
    for (const route of [
      "docs/0.1.0",
      "docs/0.1.0-beta.1",
      "releases/0-2-0",
      "releases/0-1-0",
      "blog/lavik-0-2-0-released",
    ])
      expect((await request.get(`/${locale}/${route}/`)).status()).toBe(200);
    for (const route of [
      "docs/0.2.0/quick-start",
      "releases/0-2-0",
      "blog/lavik-0-2-0-released",
    ]) {
      await page.goto(`/${locale}/${route}/`);
      await page.setViewportSize({ width: 375, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
