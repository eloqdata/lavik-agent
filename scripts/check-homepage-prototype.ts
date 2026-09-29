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
  for (const variant of ["H", "I", "J", "K"]) {
    const html = await (
      await fetch(`${origin}/${locale}/?variant=${variant}`)
    ).text();
    assert.ok(html.includes(`data-variant="${variant}"`));
    assert.ok(html.includes('data-homepage="G"'));
    assert.ok(html.includes('id="architecture"'));
    // The streamed response also includes the Suspense fallback homepage.
    const scene = html.slice(html.indexOf('class="motion-scene"'));
    const homepage = scene.slice(0, scene.indexOf("</main>"));
    assert.equal((homepage.match(/data-node="redis"/g) || []).length, 300);
    assert.equal((homepage.match(/data-node="lavik"/g) || []).length, 3);
    assert.ok(html.includes('class="motion-lab-controls"'));
    assert.equal(
      html.includes('class="motion-reading-progress"'),
      variant === "J",
    );
    if (variant === "K") {
      assert.ok(html.includes('class="motion-lab motion-k motion-j"'));
    }
  }
  for (const query of ["", "?variant=unknown"]) {
    const html = await (await fetch(`${origin}/${locale}/${query}`)).text();
    assert.ok(html.includes('data-homepage="G"'));
    assert.ok(!html.includes('class="prototype-switcher"'));
  }
}
console.log(
  "Seven layouts, four motion studies, both locales, evidence, and current-main fallback passed.",
);
