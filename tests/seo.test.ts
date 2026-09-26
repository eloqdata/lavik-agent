import assert from "node:assert/strict";
import test from "node:test";
import {
  pageInfo,
  pageMetadata,
  pageStructuredData,
} from "../packages/seo/site.ts";
test("docs aliases and language alternatives identify the same canonical editions", () => {
  const m = pageMetadata("en", "docs");
  assert.equal(m.alternates?.canonical, "https://lavik.dev/en/docs/0.1.0/");
  assert.equal(
    m.alternates?.languages?.["zh-CN"],
    "https://lavik.dev/zh-CN/docs/0.1.0/",
  );
});
test("previous metadata gaps have useful localized descriptions and complete previews", () => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const route of [
      "benchmarks",
      "cost",
      "docs/0.1.0",
      "docs/0.1.0/commands/get",
    ]) {
      const m = pageMetadata(locale, route);
      assert.ok(m.description && m.description.length > 20);
      assert.ok(m.openGraph);
      assert.ok(m.twitter);
    }
  assert.match(
    pageInfo("en", "docs/0.1.0/commands/get").description,
    /Lavik 0.1.0/,
  );
});
test("article markup matches visible metadata without inventing publication dates or ratings", () => {
  const p = pageInfo("en", "blog/why-lavik-separates-index-from-values");
  const structured = pageStructuredData("en", p.route)["@graph"][0];
  assert.equal(structured.headline, p.title);
  assert.equal(structured.dateModified, p.article!.updatedAt);
  assert.equal(structured.datePublished, undefined);
  assert.equal(structured.aggregateRating, undefined);
});
