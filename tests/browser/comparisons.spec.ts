import { test, expect } from "@playwright/test";
import {
  comparisonProducts,
  comparisonRoute,
} from "../../packages/comparisons/catalog";
test("Compare navigation works with keyboard, touch, dismissal and both languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/`);
    const trigger = page.getByRole("button", {
      name: locale === "en" ? "Compare" : "产品对比",
      exact: true,
    });
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = page.locator(".compare-panel");
    await expect(panel.getByRole("link")).toHaveCount(9);
    await page.keyboard.press("Tab");
    await expect(panel.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(panel).toHaveCount(0);
    await trigger.click();
    await page.locator("main h1").click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page
    .locator(".compare-panel")
    .getByRole("link", { name: "Lavik vs Redis", exact: false })
    .click();
  await expect(page).toHaveURL(/\/en\/compare\/lavik-vs-redis\//);
});
test("all comparison pages are readable on mobile and expose their cost and sources", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const locale of ["en", "zh-CN"]) {
    for (const p of comparisonProducts) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`/${locale}/${comparisonRoute(p.id)}/`);
      await expect(page.locator("#main")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(`Lavik vs ${p.name}`);
      await expect(
        page.locator("#performance table").first().locator("tbody tr"),
      ).toHaveCount(p.group === "historical" ? 6 : 4);
      await expect(page.locator("#cost .comparison-result")).toBeAttached();
      await expect(page.locator("#sources a").first()).toHaveAttribute(
        "href",
        /^https:\/\//,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
  }
});
test("cost calculator preserves Garnet's write advantage and refuses unsampled deadlines", async ({
  page,
}) => {
  await page.goto("/en/compare/lavik-vs-garnet/");
  const calculator = page.locator(".comparison-calculator");
  await calculator.getByLabel(/^Workload/).selectOption("SET");
  await calculator.getByLabel("Observed p99 ceiling").selectOption("2");
  await expect(calculator.locator(".comparison-result")).toContainText(
    "584,665",
  );
  await expect(calculator.locator(".comparison-result")).toContainText(
    "422,450",
  );
  await calculator
    .getByLabel("Total copies (including primary)", { exact: true })
    .fill("0");
  await expect(calculator.getByRole("alert")).toBeVisible();
  await page.goto("/en/compare/lavik-vs-dragonfly/");
  await calculator.getByLabel("Observed p99 ceiling").selectOption("1");
  await expect(calculator.locator(".comparison-result")).toContainText(
    "No measured point meets this p99 ceiling",
  );
  await page.goto("/en/compare/lavik-vs-redis/");
  await expect(calculator.locator(".comparison-result")).toContainText("20.0×");
  await calculator
    .getByLabel("Assumed SSD price (USD/GiB)", { exact: true })
    .fill("0.5");
  await expect(calculator.locator(".comparison-result")).toContainText("10.0×");
});

test("wide comparison tables support horizontal keyboard scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/compare/lavik-vs-garnet/");
  await page.locator(".comparison-sweep summary").click();
  for (const label of [
    "Scrollable performance table",
    "Scrollable full measurement table",
    "Scrollable cost estimate table",
  ]) {
    const table = page.getByRole("region", { name: label, exact: true });
    await table.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => table.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);
  }
});
