import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { blogDraftSchema } from "../packages/marketing/blog-schema.ts";
import { articleSchema, reviewSchema } from "../packages/content/schema.ts";

function inspectSchema(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach(inspectSchema);
  const schema = value as Record<string, any>;
  assert.equal(schema.oneOf, undefined, "Codex rejects oneOf");
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(
      [...(schema.required ?? [])].sort(),
      Object.keys(schema.properties ?? {}).sort(),
      "Every structured-output property must be required",
    );
  }
  Object.values(schema).forEach(inspectSchema);
}

test("writer and reviewer schemas use the accepted structured-output subset", () => {
  // The production article schema caused the actual rejected pilot request.
  assert.throws(() => inspectSchema(z.toJSONSchema(articleSchema)));
  inspectSchema(z.toJSONSchema(blogDraftSchema));
  inspectSchema(
    z.toJSONSchema(
      z.object({ en: reviewSchema, "zh-CN": reviewSchema }).strict(),
    ),
  );
});

test("drafts preserve article validation and cannot invent publication provenance", () => {
  const articles = ["en", "zh-CN"].map((locale) => ({
    id: "schema-example",
    locale,
    version: "0.1.0",
    kind: "blog",
    slug: "schema-example",
    title: "Capacity planning",
    summary: "A bounded example.",
    updatedAt: "2026-09-26",
    topics: ["architecture"],
    blocks: [
      { type: "heading", text: "Evaluate" },
      {
        type: "paragraph",
        text: "Source-backed statement.",
        sources: ["architecture"],
      },
      { type: "claim", claimId: "example" },
      { type: "recipe", recipeId: "basic-commands" },
      { type: "calculation", calculationId: "capacity-economics" },
    ],
  }));
  const parsed = blogDraftSchema.parse({ articles });
  parsed.articles.forEach((article) => articleSchema.parse(article));
  for (const changes of [
    { publishedAt: "2026-09-26" },
    { sourceRevision: "a".repeat(40) },
    { topics: undefined },
    { kind: "docs" },
    { blocks: [{ type: "heading", text: "Invalid", sources: [] }] },
  ]) {
    assert.equal(
      blogDraftSchema.safeParse({
        articles: articles.map((a) => ({ ...a, ...changes })),
      }).success,
      false,
    );
  }
});
