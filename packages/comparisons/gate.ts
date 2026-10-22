import { benchmarkSources } from "../benchmarks/repository";
import exactData from "../benchmarks/exact-data.json";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { comparisonSources, comparisonMeasurements } from "./measurements";
import { comparisonProducts } from "./catalog";
import { comparisonCopy } from "./content";
export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const comparisonReviewSchema = z
  .object({
    decision: z.enum(["pass", "block"]),
    findings: z.array(
      z.object({
        severity: z.enum(["blocking", "note"]),
        file: z.string(),
        message: z.string(),
      }),
    ),
  })
  .strict();
export type ComparisonReview = z.infer<typeof comparisonReviewSchema>;
export function comparisonFileHashes() {
  const files = [
    "packages/benchmarks/exact-data.json",
    "packages/benchmarks/raw-data.ts",
    "scripts/extract-benchmark-numbers.py",
    "scripts/review-benchmark-numbers.ts",
    "packages/benchmarks/review-lock.ts",
    "tests/exact-benchmark-data.test.ts",
    "tests/editorial-type-only.test.ts",
    "evidence/editorial/ci-baseline-20261014.json",
    ...Object.keys(exactData.sourceFiles),
    ...fs
      .readdirSync("packages/comparisons")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `packages/comparisons/${f}`),
    "apps/web/components/comparisons.tsx",
    "apps/web/app/(site)/[locale]/compare/page.tsx",
    "apps/web/app/(site)/[locale]/compare/[product]/page.tsx",
    "apps/web/components/comparison-cost.tsx",
    "evidence/comparisons/sources.json",
    ...comparisonSources.sources.map((s) => s.path),
    "scripts/review-comparisons.ts",
    "scripts/review-editorial.ts",
    "packages/benchmarks/homepage.ts",
    "packages/benchmarks/storage-data.ts",
    "packages/benchmarks/repository.ts",
    "packages/benchmarks/catalog.ts",
    "evidence/benchmarks/0.2.0/sources.json",
    ...benchmarkSources.files.map((s) => s.path),
    "packages/marketing/process-lock.ts",
    "tests/comparisons.test.ts",
  ];
  return Object.fromEntries(
    [...new Set(files)].sort().map((f) => [f, digest(fs.readFileSync(f))]),
  );
}
export function comparisonBundleHash(files: Record<string, string>) {
  return digest(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
}
const publicationSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewedFiles: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
    bundleHash: z.string(),
    reviewSha256: z.string(),
    reviewer: z
      .object({
        role: z.literal("reviewer"),
        model: z.literal("gpt-6-astra"),
        provider: z.literal("openai"),
        authentication: z.literal("chatgpt"),
        reasoning: z.literal("high"),
        additionalReviewReason: z.string().min(1).max(120).optional(),
        additionalBatchReviewReason: z.string().min(1).max(120).optional(),
        authorizedCorrectiveReviewReason: z.string().min(1).max(120).optional(),
        startedAt: z.string(),
        finishedAt: z.string(),
        promptSha256: z.string(),
        outputSha256: z.string(),
      })
      .strict(),
  })
  .strict();
export function validateComparisonPublication(
  record: unknown,
  files: Record<string, string>,
  rawReview: string,
): string[] {
  try {
    const p = publicationSchema.parse(record),
      review = comparisonReviewSchema.parse(JSON.parse(rawReview)),
      errors: string[] = [];
    if (
      review.decision !== "pass" ||
      review.findings.some((f) => f.severity === "blocking")
    )
      errors.push("Comparison review has not passed");
    if (
      p.reviewSha256 !== digest(rawReview) ||
      p.reviewer.outputSha256 !== digest(rawReview)
    )
      errors.push("Comparison review output hash changed");
    if (
      p.bundleHash !== comparisonBundleHash(p.reviewedFiles) ||
      !isDeepStrictEqual(p.reviewedFiles, files)
    )
      errors.push(
        "Comparison content differs from independently reviewed files",
      );
    return errors;
  } catch {
    return ["Comparison publication record or review is missing or invalid"];
  }
}
export function comparisonEvidenceErrors(): string[] {
  const errors: string[] = [];
  for (const [file, sha] of Object.entries(exactData.sourceFiles))
    if (digest(fs.readFileSync(file)) !== sha)
      errors.push("Raw benchmark output changed: " + file);
  for (const s of comparisonSources.sources) {
    const bytes = fs.readFileSync(s.path);
    if (digest(bytes) !== s.sha256 || bytes.length !== s.bytes)
      errors.push(`Comparison source changed: ${s.id}`);
  }
  for (const p of comparisonProducts) {
    try {
      comparisonMeasurements(p);
    } catch (e) {
      errors.push(`${p.id}: ${String(e)}`);
    }
    const c = comparisonCopy[p.id];
    if (
      !c ||
      [
        c.angle,
        c.summary,
        c.design,
        c.consequence,
        c.nuance,
        c.choose,
        c.retain,
        c.question,
        c.answer,
      ].some((text) => !text.en?.trim() || !text["zh-CN"]?.trim())
    )
      errors.push(`Missing bilingual comparison: ${p.id}`);
    for (const id of c.sources)
      if (!comparisonSources.sources.some((s) => s.id === id))
        errors.push(`Unknown comparison source: ${id}`);
  }
  return errors;
}
export function comparisonPublicationErrors(): string[] {
  try {
    return [
      ...comparisonEvidenceErrors(),
      ...validateComparisonPublication(
        JSON.parse(
          fs.readFileSync("evidence/comparisons/publication.json", "utf8"),
        ),
        comparisonFileHashes(),
        fs.readFileSync("evidence/comparisons/review.json", "utf8"),
      ),
    ];
  } catch (e) {
    return [`Comparison publication unavailable: ${String(e)}`];
  }
}
export function assertComparisonPublication() {
  const errors = comparisonPublicationErrors();
  if (errors.length) throw new Error(errors.join("\n"));
}

// An attempted re-review revokes the old approval before any model call.
// A block, timeout, exception or interruption cannot revive a stale pass.
export function beginComparisonReview(directory = "evidence/comparisons") {
  fs.rmSync(path.join(directory, "publication.json"), { force: true });
}
