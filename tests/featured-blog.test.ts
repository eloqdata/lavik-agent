import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { articles } from "../packages/content/repository.ts";
import { blogSections } from "../packages/blog/presentation.ts";
import {
  validateArticle,
  publicationErrors,
} from "../packages/content/gate.ts";
import {
  technicalArticleErrors,
  technicalPublicationErrors,
} from "../packages/blog/technical-publication.ts";
import { blogDraftSchema } from "../packages/marketing/blog-schema.ts";

const flagship = articles().find(
  (a) => a.locale === "en" && a.id === "300-redis-nodes-to-3-lavik-nodes",
)!;
test("an older featured post stays pinned as newer regular posts arrive; unfeaturing restores chronological position", () => {
  const older = { ...flagship, updatedAt: "2020-01-01" };
  const first = {
    ...flagship,
    id: "newest",
    title: "Newest",
    featured: false,
    updatedAt: "2026-10-15",
  };
  const middle = { ...first, id: "middle", updatedAt: "2025-01-01" };
  const input = [middle, older, first];
  assert.deepEqual(blogSections(input), {
    featured: [older],
    regular: [first, middle],
  });
  assert.deepEqual(input, [middle, older, first]);
  assert.deepEqual(
    blogSections([{ ...older, featured: false }, first, middle]).regular.map(
      (a) => a.id,
    ),
    ["newest", "middle", older.id],
  );
  assert.deepEqual(blogSections([]), { featured: [], regular: [] });
});

test("the flagship is featured once per language and cannot duplicate the regular feed", () => {
  for (const locale of ["en", "zh-CN"]) {
    const posts = articles().filter(
      (a) => a.locale === locale && a.kind === "blog",
    );
    const { featured, regular } = blogSections(posts);
    assert.ok(featured.some((a) => a.id === flagship.id));
    assert.equal(
      new Set([...featured, ...regular].map((a) => a.id)).size,
      posts.length,
    );
  }
  assert.ok(
    validateArticle({ ...flagship, kind: "docs" }).includes(
      "Featured is reserved for blog articles",
    ),
  );
  const shape = blogDraftSchema.shape.articles.element.shape;
  assert.ok(!("featured" in shape));
  assert.ok(!("technical" in shape));
});

test("technical articles require exact sources, rectangular tables, known citations and reviewed prose", () => {
  assert.deepEqual(publicationErrors(flagship), []);
  const changed = structuredClone(flagship);
  changed.summary += " A changed assertion.";
  assert.ok(technicalPublicationErrors(changed).length);
  changed.technical!.sources[0].sha256 = "0".repeat(64);
  assert.ok(
    technicalArticleErrors(changed).some((e) => e.includes("source changed")),
  );
  const table = changed.technical!.visuals.find((v) => v.type === "table")!;
  table.rows[0].pop();
  table.sources.push("unknown");
  assert.ok(technicalArticleErrors(changed).some((e) => e.includes("columns")));
  assert.ok(
    technicalArticleErrors(changed).some((e) => e.includes("unknown source")),
  );
});

test("altered diagram bytes or review records cannot retain approval", (t) => {
  const read = fs.readFileSync.bind(fs);
  let altered = "apps/web/public/blog-assets/agent-era/consolidation.svg";
  t.mock.method(fs, "readFileSync", ((
    file: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) => {
    const result = Reflect.apply(read, fs, [file, ...args]);
    return String(file).endsWith(altered) ? String(result) + " " : result;
  }) as typeof fs.readFileSync);
  assert.ok(technicalArticleErrors(flagship).length);
  assert.ok(technicalPublicationErrors(flagship).length);
  altered = JSON.parse(
    read(`evidence/reviews/${flagship.locale}-${flagship.id}.json`, "utf8"),
  ).record;
  assert.ok(technicalPublicationErrors(flagship).length);
});
