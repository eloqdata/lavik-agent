import { isDeepStrictEqual } from "node:util";
import {
  contentHash,
  hash,
  readText,
  knowledgeHash,
  renderingHash,
  renderingFiles,
  sources,
} from "./repository";
import { publicationRenderingHash } from "./publication-context";
import { editorialInventory, editorialRecord } from "../editorial/inventory";
import type { Article } from "./schema";

// The independently bound inventory determines when lineage is mandatory.
// Dropping flags from a mutable review cannot remove that requirement.
export function editorialContextErrors(
  article: Article,
  review: any,
): string[] {
  const expected = editorialInventory[article.locale + ":" + article.id];
  if (
    !expected ||
    (contentHash(article) !== expected.contentHash &&
      review.contentHash !== expected.contentHash)
  )
    return [];
  try {
    const context =
      expected.kind === "inherited"
        ? review.contextRefresh
        : review.editorialReview;
    if (context?.kind !== "editorial-v1" || context.record !== editorialRecord)
      throw new Error("Missing required editorial context");
    if (contentHash(article) !== expected.contentHash)
      throw new Error("Article differs from the editorial edition");
    const raw = readText(context.record),
      audit = JSON.parse(raw);
    if (hash(raw) !== context.recordSha256)
      throw new Error("Editorial record changed");
    if (
      audit.review.decision !== "pass" ||
      audit.review.findings.some((f: any) => f.severity === "blocking")
    )
      throw new Error("Editorial review did not pass");
    if (
      hash(audit.rawReview) !== audit.reviewer.outputSha256 ||
      !isDeepStrictEqual(JSON.parse(audit.rawReview), audit.review) ||
      !isDeepStrictEqual(context.reviewer, audit.reviewer)
    )
      throw new Error("Editorial review receipt mismatch");
    if (expected.kind === "revised" && review.rendererVersion !== 2)
      throw new Error(
        "Revised articles require immutable publication evidence",
      );
    if (expected.kind === "inherited") {
      const old = audit.priorArticleReviews.find(
        (x: any) =>
          x.article.id === article.id && x.article.locale === article.locale,
      );
      if (
        !old ||
        old.review.verdict !== "pass" ||
        old.contentHash !== contentHash(article) ||
        contentHash(old.article) !== old.contentHash ||
        old.review.contentHash !== old.contentHash ||
        hash(JSON.stringify(old.review)) !== context.previousReviewHash
      )
        throw new Error("Original semantic approval mismatch");
      if (
        review.rendererVersion !== old.review.rendererVersion ||
        review.publicationId !== old.review.publicationId ||
        review.artifactHash !== old.review.artifactHash
      )
        throw new Error(
          "Original renderer and immutable publication identity changed",
        );
      if (
        old.review.knowledgeHash !== audit.previousContext.knowledgeHash ||
        old.review.renderingHash !==
          (old.review.rendererVersion === 2
            ? audit.previousContext.publicationRenderingHash
            : audit.previousContext.renderingHash)
      )
        throw new Error("Original approval context mismatch");
    } else {
      const file = `content/${article.locale}/${article.id}.json`;
      if (
        audit.reviewedFiles[file] !== hash(readText(file)) ||
        audit.reviewedArticleHashes[article.locale + ":" + article.id] !==
          contentHash(article)
      )
        throw new Error("Revised article was not reviewed");
    }
    const renderer =
      review.rendererVersion === 2
        ? publicationRenderingHash()
        : renderingHash();
    if (
      audit.currentContext.knowledgeHash !== knowledgeHash() ||
      audit.currentContext[
        review.rendererVersion === 2
          ? "publicationRenderingHash"
          : "renderingHash"
      ] !== renderer
    )
      throw new Error("Editorial context is stale");
    const dependencies = [
      ...renderingFiles,
      ...(review.rendererVersion === 2
        ? [
            "apps/web/components/content-v2.tsx",
            "packages/editorial/release.ts",
          ]
        : []),
      "packages/content/publication-context.ts",
    ];
    for (const file of dependencies)
      if (audit.reviewedFiles[file] !== hash(readText(file)))
        throw new Error("Unreviewed presentation dependency: " + file);
    for (const source of sources)
      if (audit.reviewedFiles[source.path] !== source.sha256)
        throw new Error("Unreviewed source: " + source.id);
    return [];
  } catch (error) {
    return ["Editorial context approval invalid: " + String(error)];
  }
}
