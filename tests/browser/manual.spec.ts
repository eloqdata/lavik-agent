import { test, expect } from "@playwright/test";
import { manualRoutes } from "../../packages/manual/repository";

test("command search, verified examples, client settings, and bilingual navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/docs/0.1.0/overview/");
  await page
    .getByRole("link", { name: "Command Reference", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Command reference");
  await page
    .getByRole("searchbox", { name: "Find a command" })
    .fill("HREPLACE");
  await expect(page.locator(".command-list > a")).toHaveCount(1);
  await page.locator(".command-list > a").click();
  await expect(page.locator("h1")).toHaveText("LAVIK.HREPLACE");
  await expect(page.locator("article")).toContainText("WRONGTYPE");
  await page
    .getByRole("link", { name: "Switch to Simplified Chinese" })
    .click();
  await expect(page).toHaveURL(
    /\/zh-CN\/docs\/0.1.0\/commands\/lavik\.hreplace\//,
  );
  await expect(page.locator("article")).toContainText("实测示例与返回值");
  await page.goto("/en/docs/0.1.0/clients/valkey-go/");
  await expect(page.locator("article")).toContainText("DisableCache: true");
  await page
    .getByText("View the complete executed source", { exact: true })
    .click();
  await expect(page.locator("article")).toContainText("valkey.NewClient");
  expect(errors).toEqual([]);
});

test("every manual route exports with a review hash", async ({ request }) => {
  test.setTimeout(120_000);
  const manifest = await (await request.get("/manual-manifest.json")).json();
  expect(manifest.routes).toBe(manualRoutes().length * 2);
  for (const locale of ["en", "zh-CN"])
    for (const route of manualRoutes()) {
      const response = await request.get(`/${locale}/${route}/`);
      expect(response.status(), `${locale}/${route}`).toBe(200);
      expect(await response.text()).toContain(
        `data-manual-hash="${manifest.bundleHash}"`,
      );
    }
});

test("manual search, tables and executable examples fit mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const locale of ["en", "zh-CN"])
    for (const route of [
      "commands/",
      "commands/scan/",
      "commands/function/",
      "commands/georadiusbymember_ro/",
      "clients/",
      "clients/glide-node/",
    ]) {
      await page.goto(`/${locale}/docs/0.1.0/${route}`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${locale}/${route}`,
      ).toBe(true);
    }
  await page.screenshot({
    path: ".cache/screenshots/manual-mobile.png",
    fullPage: true,
  });
});
