import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { useCases } from "../../packages/use-cases/content";

const publication = JSON.parse(
  fs.readFileSync("evidence/manual/0.1.0/publication.json", "utf8"),
);

test("use-case navigation groups all seven pages and supports keyboard and touch", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"] as const) {
    await page.goto(`/${locale}/`);
    const trigger = page.getByRole("button", {
      name: locale === "en" ? "Use cases" : "使用场景",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(".use-cases-panel");
    await expect(panel.locator(".menu-column")).toHaveCount(2);
    for (const entry of useCases)
      await expect(
        panel.locator(`a[href='/${locale}/use-cases/${entry.slug}/']`),
      ).toContainText(entry.title[locale]);
    await page.keyboard.press("Tab");
    await expect(panel.locator(".menu-column a").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(panel).toHaveCount(0);
    await trigger.click();
    await page.mouse.click(5, 200);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await panel.locator(".menu-column a").first().click();
    await expect(page).toHaveURL(new RegExp(`/use-cases/${useCases[0].slug}/`));
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/");
  await page.getByRole("button", { name: "Use cases", exact: true }).click();
  await page
    .locator(".use-cases-panel")
    .getByRole("link", { name: "Explore all use cases" })
    .click();
  await expect(page).toHaveURL(/\/en\/use-cases\//);
});

test("interactive evidence preserves sampled deadlines, both operations and competitor results", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/use-cases/`);
    const explorer = page.locator(".latency-explorer");
    const lavik = explorer.locator('[data-system="lavik-spdk"]');
    const dragonfly = explorer.locator('[data-system="dragonfly"]');
    await expect(lavik).toContainText("792,119");
    await expect(lavik).toContainText("0.959 ms");
    await expect(dragonfly.locator(".no-sample")).toBeVisible();
    await explorer.locator("select").selectOption("peak");
    await expect(lavik).toContainText("952,560");
    await expect(dragonfly).toContainText("466,039");
    await expect(dragonfly).toContainText("38.911 ms");
    await explorer.getByRole("button", { name: "SET", exact: true }).click();
    await explorer.locator("select").selectOption("2");
    await expect(lavik).toContainText("422,450");
    await expect(explorer.locator('[data-system="garnet"]')).toContainText(
      "584,665",
    );
    await expect(explorer.getByRole("status")).toContainText("SET");
    await expect(page.locator("#kvrocks-comparison")).toContainText(
      "Apache Kvrocks",
    );
    await expect(page.locator("#kvrocks-comparison tbody tr")).toHaveCount(9);
  }
});

test("all reviewed use-case pages render examples and remain readable across viewport sizes", async ({
  page,
  request,
}) => {
  for (const locale of ["en", "zh-CN"] as const) {
    for (const entry of useCases) {
      const route = `/${locale}/use-cases/${entry.slug}/`;
      expect((await request.get(route)).status()).toBe(200);
      await page.goto(route);
      await expect(page.locator("main")).toHaveAttribute(
        "data-manual-hash",
        publication.bundleHash,
      );
      await expect(page.locator("h1")).toHaveText(entry.headline[locale]);
      await expect(page.locator(".solution-decisions > div")).toHaveCount(3);
      await expect(page.locator(".solution-trials > article")).toHaveCount(3);
      await page.locator(".solution-transcript summary").click();
      for (const width of [375, 820, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          `${route} ${width}px`,
        ).toBe(true);
      }
    }
    for (const width of [375, 820, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto(`/${locale}/use-cases/`);
      await page
        .getByRole("button", {
          name: locale === "en" ? "Use cases" : "使用场景",
          exact: true,
        })
        .click();
      await expect(
        page.locator(`.menu-feature a[href='/${locale}/use-cases/']`),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `menu ${locale} ${width}px`,
      ).toBe(true);
      if (locale === "en")
        await page.screenshot({
          path: `.cache/screenshots/use-cases-menu-${width}.png`,
        });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  for (const slug of ["", "ecommerce-marketplaces/"]) {
    await page.goto(`/en/use-cases/${slug}`);
    await page.screenshot({
      path: `.cache/screenshots/use-cases-${slug ? "ecommerce" : "overview"}.png`,
      fullPage: true,
    });
  }
});
