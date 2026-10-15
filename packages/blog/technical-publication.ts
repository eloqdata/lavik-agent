import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Article } from "../content/schema";
import { contentHash, hash, readText } from "../content/repository";

export function technicalArticleErrors(article: Article): string[] {
  if (!article.technical) return [];
  const errors: string[] = [];
  const { sources, visuals } = article.technical;
  if (
    article.kind !== "blog" ||
    article.blocks.some((b) => !["heading", "paragraph"].includes(b.type))
  )
    errors.push(
      "Technical articles support sourced blog prose and headings only",
    );
  if (
    new Set(sources.map((s) => s.id)).size !== sources.length ||
    new Set(visuals.map((v) => v.id)).size !== visuals.length
  )
    errors.push("Technical source and visual identifiers must be unique");
  for (const source of sources) {
    try {
      if (hash(readText(source.file)) !== source.sha256)
        errors.push("Technical source changed: " + source.id);
    } catch {
      errors.push("Technical source missing: " + source.id);
    }
  }
  for (const visual of visuals) {
    if (visual.afterBlock >= article.blocks.length)
      errors.push("Visual insertion point is missing");
    if (visual.sources.some((id) => !sources.some((s) => s.id === id)))
      errors.push("Visual cites an unknown source");
    if (
      visual.type === "table" &&
      visual.rows.some((row) => row.length !== visual.columns.length)
    )
      errors.push("Table columns do not match rows");
    if (visual.type === "figure") {
      try {
        const svg = readText("apps/web/public" + visual.src);
        if (
          hash(svg) !== visual.sha256 ||
          /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=["'](?!#)/i.test(
            svg,
          )
        )
          errors.push("Technical figure changed or contains active content");
      } catch {
        errors.push("Technical figure missing");
      }
    }
  }
  return errors;
}

// Article-scoped sources avoid invalidating unrelated, previously reviewed posts.
export function technicalFileHashes(article: Article) {
  if (!article.technical) throw new Error("Technical article required");
  const files = [
    `content/${article.locale}/${article.id}.json`,
    "packages/content/schema.ts",
    "packages/content/gate.ts",
    "packages/blog/technical-schema.ts",
    "packages/blog/technical-publication.ts",
    "apps/web/components/technical-article.tsx",
    ...article.technical.sources.map((source) => source.file),
    ...article.technical.visuals.flatMap((v) =>
      v.type === "figure" ? ["apps/web/public" + v.src] : [],
    ),
  ];
  return Object.fromEntries(
    [...new Set(files)].sort().map((file) => [file, hash(readText(file))]),
  );
}
const publicationSchema = z
  .object({
    rendererVersion: z.literal(3),
    verdict: z.literal("pass"),
    contentHash: z.string(),
    record: z.string().regex(/^evidence\/technical\/[a-z0-9-]+\/review\.json$/),
    recordSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export function technicalPublicationErrors(article: Article): string[] {
  try {
    const publication = publicationSchema.parse(
      JSON.parse(
        readText(`evidence/reviews/${article.locale}-${article.id}.json`),
      ),
    );
    const raw = readText(publication.record),
      record = JSON.parse(raw);
    const review = JSON.parse(record.rawReview);
    if (
      hash(raw) !== publication.recordSha256 ||
      publication.contentHash !== contentHash(article)
    )
      throw new Error("Article or review record changed");
    if (
      review.decision !== "pass" ||
      !Array.isArray(review.findings) ||
      review.findings.some(
        (f: { severity: string }) => f.severity === "blocking",
      )
    )
      throw new Error("Independent review did not pass");
    if (
      record.reviewer?.role !== "reviewer" ||
      record.reviewer.authentication !== "chatgpt" ||
      record.reviewer.provider !== "openai" ||
      record.reviewer.model !== "gpt-6-astra" ||
      record.reviewer.reasoning !== "high" ||
      record.reviewer.outputSha256 !== hash(record.rawReview)
    )
      throw new Error("Independent review provenance is invalid");
    const files = technicalFileHashes(article);
    for (const [file, sha] of Object.entries(files))
      if (record.reviewedFiles?.[file] !== sha)
        throw new Error("Unreviewed technical content: " + file);
    if (
      !isDeepStrictEqual(
        record.editions?.[article.locale + ":" + article.id],
        files,
      )
    )
      throw new Error("Technical publication inventory changed");
    return [];
  } catch (error) {
    return ["Technical article publication unavailable: " + String(error)];
  }
}
