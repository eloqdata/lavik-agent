import { test, expect } from "@playwright/test";
import { faqFor } from "../../packages/editorial/faq";
import {
  comparisonProducts,
  comparisonRoute,
} from "../../packages/comparisons/catalog";
import { useCases } from "../../packages/use-cases/content";
test("current adoption pages consistently use stable release guidance in both languages", async ({
  page,
  request,
}) => {
  test.setTimeout(180000);
  for (const locale of ["en", "zh-CN"] as const) {
    const routes = [
      "",
      "about",
      "community",
      "cost",
      "faq/evaluation",
      "compare",
      ...comparisonProducts.map((p) => comparisonRoute(p.id)),
      ...useCases.map((c) => "use-cases/" + c.slug),
    ];
    for (const route of routes) {
      await page.goto(`/${locale}/${route ? route + "/" : ""}`);
      await expect(page.locator("#main")).not.toContainText(
        /0\.1\.0-beta\.1|Download the beta|downloadable beta/,
      );
      expect(
        await page.locator('#main a[href*="docs/0.1.0-beta.1"]').count(),
      ).toBe(0);
      await expect(page.locator("h1")).toHaveCount(1);
    }
    await page.goto(`/${locale}/faq/evaluation/`);
    const data = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const faq = data
      .flatMap((text) => JSON.parse(text)["@graph"] ?? [])
      .find((x: any) => x["@type"] === "FAQPage");
    expect(faq).toBeDefined();
    expect(
      faq.mainEntity.map((x: any) => [x.name, x.acceptedAnswer.text]),
    ).toEqual(faqFor(locale).map((f) => [f.question, f.answer]));
    for (const f of faqFor(locale))
      expect((await request.get(`/${locale}/${f.path}/`)).status()).toBe(200);
    await page.goto(`/${locale}/blog/lavik-0-1-0-released/`);
    await expect(page.locator(".prose")).toContainText("1,145.8k");
    await expect(page.locator(".prose")).toContainText("385,514");
    await expect(page.locator(".prose")).not.toContainText("1,012,180");
    await page.goto(`/${locale}/use-cases/datasets-beyond-memory/`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://lavik.dev/${locale}/use-cases/large-application-caches/`,
    );
  }
});
test("current homepage cost bars use equal DRAM prices and stable structured data", async ({
  page,
}) => {
  await page.goto("/en/");
  expect(await page.locator(".dual-cost-row strong").allTextContents()).toEqual(
    ["5%", "100%", "100%"],
  );
  const json = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const graphs = json.flatMap((t) => JSON.parse(t)["@graph"] ?? []);
  expect(
    graphs.find((x: any) => x["@type"] === "SoftwareSourceCode").version,
  ).toBe("0.2.0");
});
