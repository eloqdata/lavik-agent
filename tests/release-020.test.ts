import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hash, articles } from "../packages/content/repository.ts";
import { defaultDocVersion, docVersions } from "../packages/docs/versions.ts";
import {
  stableReleaseFor,
  stablePackages,
  stableGuides,
} from "../packages/docs/stable.ts";
import { blogSections } from "../packages/blog/presentation.ts";
import { pageMetadata } from "../packages/seo/site.ts";
import { publicationErrors } from "../packages/content/gate.ts";
import { documentationPublicationErrors } from "../packages/docs/publication.ts";

test("0.2.0 is current while historical posts and docs remain intact outside the reviewed featured revision", () => {
  assert.equal(defaultDocVersion, "0.2.0");
  assert.deepEqual(docVersions, ["0.2.0", "0.1.0", "0.1.0-beta.1"]);
  const baseline = JSON.parse(
    fs.readFileSync("evidence/docs/0.2.0/historical-content.json", "utf8"),
  );
  // The owner requested a subsequent 0.2.0 revision of this exact featured pair.
  // Preserve the original snapshot and byte-check every other historical file.
  const revisedFeatured = new Set([
    "content/en/300-redis-nodes-to-3-lavik-nodes.json",
    "content/zh-CN/300-redis-nodes-to-3-lavik-nodes.json",
  ]);
  for (const [file, digest] of Object.entries(baseline.files)) {
    if (revisedFeatured.has(file)) {
      const article = articles().find(
        (a) => `content/${a.locale}/${a.id}.json` === file,
      );
      assert.ok(article, file);
      assert.equal(article.featured, true, file);
      assert.equal(article.version, "0.2.0", file);
      assert.equal(article.publishedAt, "2026-10-15", file);
      assert.deepEqual(publicationErrors(article), [], file);
    } else {
      assert.equal(hash(fs.readFileSync(file)), digest, file);
    }
  }
  assert.equal(
    stableReleaseFor("0.1.0").commit,
    "feb61224e414c5653fd09560e20c9d214db1e3ac",
  );
  assert.equal(
    stableReleaseFor("0.2.0").commit,
    "2908f86f2770e9c6e8acc6585b3bedb4b44d1cd5",
  );
  for (const version of ["0.1.0", "0.2.0"] as const) {
    assert.equal(stablePackages(version).length, 4);
    assert.ok(
      stablePackages(version).every((p) => p.url.includes(`/v${version}/`)),
    );
    assert.ok(
      stableGuides(version).every((g) =>
        g.sections.every((s) =>
          s.blocks.every(
            (b) =>
              b.type !== "code" ||
              b.file.startsWith(`verification/docs/${version}/`),
          ),
        ),
      ),
    );
  }
});

test("the 0.2.0 release blog is a regular bilingual post with pinned evidence", () => {
  for (const locale of ["en", "zh-CN"] as const) {
    const posts = articles().filter(
      (a) => a.locale === locale && a.kind === "blog",
    );
    const article = posts.find((a) => a.id === "lavik-0-2-0-released")!;
    assert.equal(article.version, "0.2.0");
    assert.equal(article.featured, false);
    assert.ok(blogSections(posts).regular.some((a) => a.id === article.id));
    assert.ok(!blogSections(posts).featured.some((a) => a.id === article.id));
    for (const source of article.technical!.sources)
      assert.equal(hash(fs.readFileSync(source.file)), source.sha256);
    assert.equal(
      pageMetadata(locale, "docs").alternates?.canonical,
      `https://lavik.dev/${locale}/docs/0.2.0/`,
    );
  }
  assert.deepEqual(documentationPublicationErrors(), []);
});
