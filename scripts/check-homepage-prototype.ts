// THROWAWAY smoke check. Start `npm run dev -- --hostname 127.0.0.1 --port 3100`.
// Check: node --import tsx scripts/check-homepage-prototype.ts
import assert from "node:assert/strict";
import { benchmarkRows } from "../packages/content/benchmarks.ts";

const origin = "http://127.0.0.1:3100";
for (const locale of ["en", "zh-CN"]) {
  for (const variant of ["A", "B", "C", "D", "E", "F", "G"]) {
    const response = await fetch(`${origin}/${locale}/?variant=${variant}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(
      html.includes(`data-variant="${variant}"`),
      `${locale}/${variant}`,
    );
    assert.ok(html.includes("prototype-switcher"));
    assert.ok(html.includes("20:1"));
    assert.ok(html.includes(`/${locale}/benchmarks/`));
    assert.ok(html.includes(`/${locale}/docs/0.1.0/quick-start/`));
    if (["B", "C", "D", "F", "G"].includes(variant)) {
      for (const row of benchmarkRows()) {
        assert.ok(
          html.includes(variant === "D" ? row.name.split(" ")[0] : row.name),
        );
        assert.ok(html.includes(row.get.toLocaleString("en-US")));
        assert.ok(html.includes(row.set.toLocaleString("en-US")));
      }
    }
    if (["D", "F"].includes(variant)) {
      assert.match(html, /<details class="astra-proof[^\"]*">/);
    }
    if (variant === "G") {
      const costChart = html.slice(
        html.indexOf('class="dual-card dual-cost-card"'),
        html.indexOf('class="dual-sources"'),
      );
      assert.ok(costChart.includes('style="width:5%"'));
      assert.ok(costChart.includes('style="width:80%"'));
      assert.equal((costChart.match(/style="width:100%"/g) || []).length, 1);
      assert.ok(
        costChart.includes(locale === "en" ? "Illustrative model" : "示意模型"),
      );
      assert.ok(html.includes('href="https://www.dragonflydb.io/"'));
    }
  }
  for (const query of ["", "?variant=unknown"]) {
    const html = await (await fetch(`${origin}/${locale}/${query}`)).text();
    assert.ok(html.includes('class="hero"'));
    assert.ok(!html.includes('class="prototype-switcher"'));
  }
}
console.log(
  "Seven variants, both locales, benchmark values, links, and original-page fallback passed.",
);
