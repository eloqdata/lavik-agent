import { test, expect } from "@playwright/test";
import fs from "node:fs";
const receipt = JSON.parse(
  fs.readFileSync("evidence/downloads/0.1.0/verification.json", "utf8"),
) as {
  release: string;
  packages: { filename: string; sha256: string; commands: string }[];
};
const downloadPackages = receipt.packages.map((pkg) => ({
  ...pkg,
  url: `https://github.com/eloqdata/lavik/releases/download/${receipt.release}/${pkg.filename}`,
}));

test("download choices expose verified links, checksums and commands in both languages", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/download/`);
    await expect(page.locator("h1")).toContainText("Lavik");
    await expect(page.locator("main")).toContainText("v0.1.0-beta.1");
    for (const [index, pkg] of downloadPackages.entries()) {
      const card = page.locator(".download-card").nth(index);
      await expect(card.locator("a.button")).toHaveAttribute("href", pkg.url);
      await card.locator("summary").click();
      await expect(card.locator(".checksum-value")).toHaveText(pkg.sha256);
      await expect(card.locator("pre code")).toHaveText(pkg.commands);
      await card.getByRole("button").click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        pkg.commands,
      );
    }
  }
});

test("docs hub search finds commands and clients; mobile navigation is accessible", async ({
  page,
}) => {
  await page.goto("/en/docs/0.1.0/");
  await expect(page.locator("h1")).toHaveText("Lavik documentation");
  const search = page.getByRole("searchbox", { name: "Search documentation" });
  await search.fill("HREPLACE");
  await page
    .locator(".docs-search-results")
    .getByRole("link", { name: "LAVIK.HREPLACE Command", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("LAVIK.HREPLACE");
  await page
    .getByRole("searchbox", { name: "Search documentation" })
    .fill("valkey-go");
  await page.locator(".docs-search-results a").first().click();
  await expect(page).toHaveURL(/\/clients\/valkey-go\//);
  await expect(page.locator("article")).toContainText("DisableCache: true");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/zh-CN/docs/0.1.0/");
  const toggle = page.getByRole("button", { name: "文档目录" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(
    page.getByRole("navigation", { name: "文档导航" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "文档导航" })
    .getByRole("link", { name: "命令参考", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("命令参考");
});

test("new public pages, community destinations, and Blog navigation", async ({
  page,
  request,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/community/`);
    await expect(
      page.locator('a[href="https://lavik.dev/community/slack/"]'),
    ).toBeVisible();
    await expect(
      page.locator('a[href="https://lavik.dev/community/discord/"]'),
    ).toBeVisible();
    await page.goto(`/${locale}/blog/`);
    await expect(page.locator("h1")).toHaveText(
      locale === "en" ? "Lavik Blog" : "Lavik 博客",
    );
    await expect(page.locator("header")).not.toContainText("Journal");
    for (const section of ["download", "community", "docs/0.1.0", "docs"])
      expect((await request.get(`/${locale}/${section}/`)).status()).toBe(200);
  }
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const locale of ["en", "zh-CN"])
      for (const section of ["download", "community", "docs/0.1.0", "blog"]) {
        await page.goto(`/${locale}/${section}/`);
        if (section === "download")
          for (const summary of await page
            .locator(".download-card summary")
            .all())
            await summary.click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${width}/${locale}/${section}`,
        ).toBe(true);
      }
  }
  for (const section of ["download", "community", "docs/0.1.0"]) {
    await page.goto(`/en/${section}/`);
    await page.screenshot({
      path: `.cache/screenshots/${section.replaceAll("/", "-")}.png`,
      fullPage: true,
    });
  }
});
