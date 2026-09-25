import { test, expect } from "@playwright/test";
import fs from "node:fs";
// Read the published fixtures directly: the server repository module imports
// JSON through Next/tsx, which Playwright's native ESM loader does not support.
const operationsGuides = JSON.parse(
  fs.readFileSync("content/operations/0.1.0/guides.json", "utf8"),
) as { id: string; layout: "single" | "ha"; title: Record<string, string> }[];
const operationSnippet = (name: string) =>
  fs.readFileSync(`verification/operations/snippets/${name}.sh`, "utf8").trim();

test("bilingual lavik-ctl guides expose tested commands, Grafana setup and accurate scope", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const guide of operationsGuides) {
      await page.goto(`/${locale}/docs/0.1.0/${guide.id}/`);
      await expect(page.locator("h1")).toHaveText(guide.title[locale]);
      await expect(page).toHaveTitle(new RegExp("lavik-ctl"));
      await expect(page.locator("main")).toHaveAttribute(
        "data-manual-hash",
        /^[a-f0-9]{64}$/,
      );
      for (const name of [
        "versions",
        `${guide.layout}-init`,
        `${guide.layout}-start`,
        "create",
        "status",
        "monitor-local",
        "stop",
      ]) {
        const blocks = page.locator(`[data-operator-snippet="${name}"] pre`);
        expect(await blocks.count()).toBeGreaterThan(0);
        for (const block of await blocks.all())
          await expect(block).toHaveText(operationSnippet(name));
      }
      await expect(page.locator(".operations-evidence")).toContainText("SPDK");
      await expect(page.locator(".operations-next")).toHaveAttribute(
        "href",
        new RegExp(guide.layout === "single" ? "ha-cluster" : "single-node"),
      );
      await expect(
        page.locator(".operations-toc a[href='#monitoring']"),
      ).toHaveCount(1);
      for (const width of [375, 820, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
});

test("docs navigation, search and manifest include the operator guides", async ({
  page,
  request,
}) => {
  await page.goto("/en/docs/0.1.0/");
  await expect(
    page.locator(
      ".docs-sidebar a[href='/en/docs/0.1.0/lavik-ctl-single-node/']",
    ),
  ).toBeVisible();
  await expect(
    page.locator(
      ".docs-guide-list a[href='/en/docs/0.1.0/lavik-ctl-ha-cluster/']",
    ),
  ).toBeVisible();
  await page.locator(".docs-sidebar input").fill("Grafana");
  for (const guide of operationsGuides)
    await expect(
      page.locator(
        `.docs-search-results a[href='/en/docs/0.1.0/${guide.id}/']`,
      ),
    ).toBeVisible();
  const manifest = await (await request.get("/manual-manifest.json")).json();
  expect(manifest.operatorGuides).toHaveLength(4);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const route of manifest.operatorGuides)
    expect(sitemap).toContain(`https://lavik.dev${route}`);
});
