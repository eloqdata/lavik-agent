import fs from "node:fs";
import path from "node:path";
import {
  articleSchema,
  receiptSchema,
  type Article,
  type Receipt,
} from "./schema.ts";
import {
  claims,
  contentHash,
  harnessHash,
  hash,
  knowledgeHash,
  readJson,
  recipes,
  recipeHash,
  release,
  renderingHash,
  root,
  sourceText,
  sources,
} from "./repository.ts";
import { publicationRenderingHash } from "./publication-context.ts";

export function checkReceipt(receipt: Receipt, recipeId: string): string[] {
  const failures: string[] = [];
  if (receipt.status !== "passed")
    failures.push(`${recipeId}: execution did not pass (${receipt.status})`);
  if (
    receipt.recipeId !== recipeId ||
    receipt.recipeHash !== recipeHash(recipeId)
  )
    failures.push(`${recipeId}: recipe changed or mismatched`);
  if (
    receipt.sourceCommit !== release.commit ||
    receipt.release !== release.release
  )
    failures.push(`${recipeId}: release mismatch`);
  if (receipt.harnessHash !== harnessHash())
    failures.push(`${recipeId}: verification environment changed`);
  if (
    !Object.values(release.artifacts).some(
      (a) => a.sha256 === receipt.artifactSha256,
    )
  )
    failures.push(`${recipeId}: unrecognized binary`);
  if (!/^sha256:[a-f0-9]{64}$/.test(receipt.imageId))
    failures.push(`${recipeId}: missing container image identity`);
  if (
    Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt) ||
    Date.parse(receipt.completedAt) > Date.now() + 60_000
  )
    failures.push(`${recipeId}: invalid execution timestamps`);
  try {
    const transcript = JSON.parse(receipt.output);
    const expected = recipes.find((recipe) => recipe.id === recipeId)!.steps;
    if (
      transcript.status !== "passed" ||
      transcript.sourceCommit !== release.commit ||
      transcript.binaryVersion !== `lavik ${release.release}` ||
      transcript.gracefulRestart !== "passed" ||
      transcript.steps?.length !== expected.length ||
      expected.some(
        (step, index) =>
          JSON.stringify(step.argv) !==
            JSON.stringify(transcript.steps[index].argv) ||
          step.expected !== transcript.steps[index].actual,
      )
    )
      failures.push(
        `${recipeId}: transcript does not prove the expected results`,
      );
  } catch {
    failures.push(`${recipeId}: unreadable execution transcript`);
  }
  return failures;
}

// Pattern checks catch known regressions; independent semantic review remains required.
const unsupported = [
  /without (?:affecting|compromising) (?:the )?SLA/i,
  /(?:guaranteed|unchanged) SLA/i,
  /(?:不影响|不降低).{0,8}SLA/i,
  /trusted by|our customers|customer success|客户案例|客户见证|客户遍布/i,
  /100%\s*(?:Redis|compatible)|fully Redis.compatible|完全兼容\s*Redis/i,
];
export function validateArticle(
  article: Article,
  getReceipt?: (id: string) => Receipt,
): string[] {
  const failures: string[] = [];
  articleSchema.parse(article);
  const text = [
    article.title,
    article.summary,
    ...article.blocks.flatMap((b) => ("text" in b ? [b.text] : [])),
  ].join("\n");
  const citedClaims = article.blocks.flatMap((b) =>
    b.type === "claim" ? [b.claimId] : [],
  );
  if (
    citedClaims.some((id) => ["benchmark-get", "benchmark-set"].includes(id)) &&
    !citedClaims.includes("benchmark-scope")
  )
    failures.push(
      "Benchmark numbers require their methodology and limitations",
    );
  if (unsupported.some((pattern) => pattern.test(text)))
    failures.push("Unsupported cost, SLA, adoption, or compatibility claim");
  if (
    /(?:20\s*[x×]|20[- ]?fold|20\s*倍)/i.test(text) &&
    !article.blocks.some((b) => b.type === "calculation")
  )
    failures.push(
      "Quantified cost reasoning needs a calculation block with explicit assumptions",
    );
  if (/<\/?[a-z][^>]*>|```|\]\(javascript:/i.test(text))
    failures.push(
      "Use structured blocks; raw HTML and freehand code are not publishable",
    );
  for (const block of article.blocks) {
    if (block.type === "paragraph") {
      if (!block.sources.length)
        failures.push("Every factual paragraph needs a source reference");
      for (const id of block.sources) {
        try {
          sourceText(id);
        } catch {
          failures.push(`Missing or changed source: ${id}`);
        }
      }
    }
    if (block.type === "claim") {
      const claim = claims.find((c) => c.id === block.claimId);
      if (!claim || claim.status !== "supported")
        failures.push(`Unsupported claim: ${block.claimId}`);
      else
        for (const id of claim.sources) {
          try {
            sourceText(id);
          } catch {
            failures.push(`Missing or changed source: ${id}`);
          }
        }
    }
    if (block.type === "recipe") {
      if (!getReceipt) {
        failures.push(`No execution evidence for ${block.recipeId}`);
        continue;
      }
      try {
        failures.push(
          ...checkReceipt(getReceipt(block.recipeId), block.recipeId),
        );
      } catch (error) {
        failures.push(
          `${block.recipeId}: ${error instanceof Error ? error.message : "invalid evidence"}`,
        );
      }
    }
  }
  return [...new Set(failures)];
}
export function storedReceipt(id: string): Receipt {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid recipe id");
  return receiptSchema.parse(readJson(`evidence/verification/${id}.json`));
}
export function publicationErrors(article: Article): string[] {
  const failures = validateArticle(article, (id) =>
    articleReceipt(article, id),
  );
  const reviewPath = path.join(
    root,
    "evidence/reviews",
    `${article.locale}-${article.id}.json`,
  );
  if (!fs.existsSync(reviewPath))
    return [...failures, "No independent review record"];
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  if (review.rendererVersion === 2) {
    try {
      if (!/^[a-f0-9-]{36}$/.test(review.publicationId ?? ""))
        throw new Error("Invalid publication identity");
      const manifest = readJson(
        `evidence/publications/${review.publicationId}/manifest.json`,
      ) as {
        taskId: string;
        artifactHash: string;
        editions: {
          locale: string;
          id: string;
          contentHash: string;
          receiptHashes: Record<string, string>;
        }[];
      };
      const edition = manifest.editions.find(
        (e) => e.locale === article.locale && e.id === article.id,
      );
      if (
        manifest.taskId !== review.publicationId ||
        manifest.artifactHash !== review.artifactHash ||
        edition?.contentHash !== contentHash(article)
      )
        failures.push(
          "Publication manifest does not match the reviewed article",
        );
      for (const [id, expected] of Object.entries(
        edition?.receiptHashes ?? {},
      )) {
        if (hash(JSON.stringify(articleReceipt(article, id))) !== expected)
          failures.push(`Reviewed execution record changed: ${id}`);
      }
      for (const block of article.blocks)
        if (block.type === "recipe" && !edition?.receiptHashes[block.recipeId])
          failures.push(`No immutable execution record: ${block.recipeId}`);
    } catch {
      failures.push("Missing or invalid immutable publication evidence");
    }
  }
  if (review.contentHash !== contentHash(article) || review.verdict !== "pass")
    failures.push("Review missing, failed, or invalidated by a content change");
  if (review.releaseCommit !== release.commit)
    failures.push("Review targets a different release");
  if (review.knowledgeHash !== knowledgeHash())
    failures.push("Review invalidated by changed claims or evidence registry");
  if (
    review.method === "agent-review" &&
    review.renderingHash !==
      (review.rendererVersion === 2
        ? publicationRenderingHash()
        : renderingHash())
  )
    failures.push(
      "Review invalidated by changed content rendering or calculator logic",
    );
  if (
    !review.reviewer ||
    !["source-audit", "agent-review"].includes(review.method)
  )
    failures.push("Review provenance missing");
  for (const source of sources) {
    if (review.sourceHashes?.[source.id] !== source.sha256)
      failures.push(`Review evidence changed: ${source.id}`);
  }
  return failures;
}

export function articleReview(article: Article) {
  return readJson(`evidence/reviews/${article.locale}-${article.id}.json`) as {
    rendererVersion?: number;
    publicationId?: string;
    contentHash: string;
    artifactHash?: string;
  };
}
export function articleReceipt(article: Article, id: string): Receipt {
  const review = articleReview(article);
  if (review.rendererVersion !== 2) return storedReceipt(id);
  if (
    !/^[a-f0-9-]{36}$/.test(review.publicationId ?? "") ||
    !/^[a-z0-9-]+$/.test(id)
  )
    throw new Error("Invalid publication evidence identity");
  return receiptSchema.parse(
    readJson(
      `evidence/publications/${review.publicationId}/${article.locale}-${id}.json`,
    ),
  );
}
export function articleReceipts(article: Article) {
  return article.blocks.flatMap((block) =>
    block.type === "recipe" ? [articleReceipt(article, block.recipeId)] : [],
  );
}
