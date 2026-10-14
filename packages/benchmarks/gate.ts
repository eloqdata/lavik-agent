import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { benchmarkReports } from "./catalog";
import {
  benchmarkSources,
  benchmarkRoot,
  sourceFile,
  reportAssets,
  digest,
} from "./repository";
export const benchmarkReviewSchema = z
  .object({
    decision: z.enum(["pass", "block"]),
    findings: z.array(
      z
        .object({
          severity: z.enum(["blocking", "note"]),
          file: z.string(),
          message: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export const benchmarkBoundFiles = [
  "packages/benchmarks/homepage.ts",
  "apps/web/app/(site)/[locale]/page.tsx",
  "apps/web/components/homepage.tsx",
  "apps/web/components/homepage.css",
  "apps/web/components/benchmark.tsx",
  "tests/homepage-benchmark.test.ts",
  "apps/web/components/site.tsx",
  "packages/seo/site.ts",
  "apps/web/app/(entry)/sitemap.ts",
  "scripts/build-discovery.ts",
  "apps/web/app/(site)/[locale]/[...slug]/page.tsx",
  "scripts/check-content.ts",
  "apps/web/app/(site)/[locale]/layout.tsx",
  "apps/web/components/compare-menu.tsx",
  "apps/web/components/use-cases.css",
  "tests/browser/benchmark-reports.spec.ts",
  "tests/browser/site.spec.ts",
  "tests/browser/discovery.spec.ts",
  "packages/benchmarks/catalog.ts",
  "packages/benchmarks/repository.ts",
  "packages/benchmarks/storage-data.ts",
  "packages/benchmarks/gate.ts",
  "apps/web/components/benchmarks-menu.tsx",
  "apps/web/components/benchmark-reports.tsx",
  "apps/web/components/benchmark-reports.css",
  "apps/web/components/benchmark-code.tsx",
  "apps/web/components/benchmark-snapshot.tsx",
  "apps/web/app/(site)/[locale]/benchmarks/page.tsx",
  "apps/web/app/(site)/[locale]/benchmarks/[report]/page.tsx",
  "apps/web/app/(entry)/benchmark-assets/0.1.0/[report]/[file]/route.ts",
  "package.json",
  "package-lock.json",
  "tests/benchmark-reports.test.ts",
  "scripts/review-benchmarks.ts",
  benchmarkRoot + "/sources.json",
];
export const benchmarkFileHashes = () =>
  Object.fromEntries(
    [
      ...new Set([
        ...benchmarkBoundFiles,
        ...benchmarkSources.files.map((s) => s.path),
      ]),
    ]
      .sort()
      .map((file) => [file, digest(fs.readFileSync(file))]),
  );
export const benchmarkBundleHash = (files: Record<string, string>) =>
  digest(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
const publicationSchema = z
  .object({
    schemaVersion: z.literal(1),
    reviewedFiles: z.record(z.string(), z.string()),
    bundleHash: z.string(),
    reviewSha256: z.string(),
    reviewer: z
      .object({
        role: z.literal("reviewer"),
        model: z.literal("gpt-6-astra"),
        provider: z.literal("openai"),
        authentication: z.literal("chatgpt"),
        reasoning: z.literal("high"),
        promptSha256: z.string(),
        outputSha256: z.string(),
        startedAt: z.string(),
        finishedAt: z.string(),
      })
      .strict(),
  })
  .strict();
export function validateBenchmarkPublication(
  record: unknown,
  files: Record<string, string>,
  raw: string,
) {
  try {
    const p = publicationSchema.parse(record),
      review = benchmarkReviewSchema.parse(JSON.parse(raw)),
      errors: string[] = [];
    if (
      review.decision !== "pass" ||
      review.findings.some((f) => f.severity === "blocking")
    )
      errors.push("Benchmark review has not passed");
    if (
      p.reviewSha256 !== digest(raw) ||
      p.reviewer.outputSha256 !== digest(raw)
    )
      errors.push("Benchmark review output changed");
    if (
      p.bundleHash !== benchmarkBundleHash(p.reviewedFiles) ||
      !isDeepStrictEqual(p.reviewedFiles, files)
    )
      errors.push("Benchmark content changed after review");
    return errors;
  } catch {
    return [
      "Benchmark publication or independent review is missing or invalid",
    ];
  }
}
export function benchmarkEvidenceErrors() {
  const errors: string[] = [];
  try {
    if (!/^[a-f0-9]{40}$/.test(benchmarkSources.commit))
      errors.push("Missing source commit");
    if (
      new Set(benchmarkSources.files.map((s) => s.path)).size !==
      benchmarkSources.files.length
    )
      errors.push("Duplicate benchmark sources");
    for (const a of reportAssets()) {
      const r = benchmarkReports.find((r) => r.id === a.report)!,
        { entry, data } = sourceFile(r, a.file);
      if (
        entry.url !==
        "https://github.com/eloqdata/lavik/blob/" +
          benchmarkSources.commit +
          "/" +
          entry.upstreamPath
      )
        errors.push("Unpinned benchmark URL");
      if (
        a.file.endsWith(".svg") &&
        /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(
          data.toString(),
        )
      )
        errors.push("Active/external chart content: " + a.file);
    }
    for (const r of benchmarkReports)
      for (const file of ["README.md", "README.zh-CN.md"]) sourceFile(r, file);
  } catch (e) {
    errors.push(String(e));
  }
  return errors;
}
export function benchmarkPublicationErrors() {
  try {
    return [
      ...benchmarkEvidenceErrors(),
      ...validateBenchmarkPublication(
        JSON.parse(
          fs.readFileSync("evidence/benchmarks/publication.json", "utf8"),
        ),
        benchmarkFileHashes(),
        fs.readFileSync("evidence/benchmarks/review.json", "utf8"),
      ),
    ];
  } catch (e) {
    return ["Benchmark publication unavailable: " + String(e)];
  }
}
export function assertBenchmarkPublication() {
  const errors = benchmarkPublicationErrors();
  if (errors.length) throw new Error(errors.join("\n"));
}
