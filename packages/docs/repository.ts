import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { hash, readText, release } from "../content/repository";
const text = z
  .object({ en: z.string().min(1), "zh-CN": z.string().min(1) })
  .strict();
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text }).strict(),
  z.object({ type: z.literal("link"), text, href: z.string() }).strict(),
  z
    .object({
      type: z.literal("file"),
      name: z.enum([
        "Dockerfile",
        "start.sh",
        "compose.yaml",
        "docker-run.sh",
        "attach-redis.sh",
        "attach-cluster.sh",
        "detach.sh",
      ]),
    })
    .strict(),
]);
const schema = z
  .object({
    id: z.enum([
      "install-docker",
      "install-docker-compose",
      "migrate-redis",
      "migrate-redis-cluster",
    ]),
    title: text,
    summary: text,
    sections: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z-]+$/),
            title: text,
            blocks: z.array(block).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const userGuides = schema
  .array()
  .parse(JSON.parse(readText("packages/docs/guides.json")));
export type UserGuide = z.infer<typeof schema>;
export const userGuideRoutes = () =>
  userGuides.map((g) => `docs/0.1.0/${g.id}`);
export const onboardingFiles = () =>
  fs
    .readdirSync("verification/onboarding")
    .sort()
    .map((f) => `verification/onboarding/${f}`)
    .concat("scripts/verify-onboarding.py")
    .sort();
export const onboardingReviewedFiles = () => [
  ...onboardingFiles(),
  "packages/docs/repository.ts",
  "apps/web/components/content.tsx",
  "apps/web/components/resources.css",
  "tests/browser/manual.spec.ts",
  "tests/browser/resources.spec.ts",
  "tests/browser/site.spec.ts",
  "packages/docs/guides.json",
  "apps/web/components/user-guide.tsx",
  "evidence/onboarding/0.1.0/verification.json",
  "evidence/onboarding/0.1.0/sources.json",
  ...fs
    .readdirSync("evidence/onboarding/0.1.0/sources")
    .sort()
    .map((f) => `evidence/onboarding/0.1.0/sources/${f}`),
  "tests/browser/docs-navigation.spec.ts",
  "tests/onboarding.test.ts",
];
export function onboardingErrors(
  report = JSON.parse(readText("evidence/onboarding/0.1.0/verification.json")),
) {
  const errors: string[] = [];
  try {
    if (
      report.status !== "passed" ||
      report.version !== release.release ||
      report.sourceCommit !== release.commit ||
      report.binaryVersion !== `lavik ${release.release}` ||
      !/^sha256:[a-f0-9]{64}$/.test(report.lavikImage) ||
      !/^[a-f0-9]{64}$/.test(report.binarySha256) ||
      !isDeepStrictEqual(
        report.fileHashes,
        Object.fromEntries(
          onboardingFiles().map((f) => [f, hash(readText(f))]),
        ),
      )
    )
      errors.push("Onboarding execution is failed or stale");
    if (
      !isDeepStrictEqual(
        report.cases.map((c: any) => c.name),
        ["docker", "compose", "redis", "redis-cluster"],
      ) ||
      report.cases.some((c: any) => c.status !== "passed")
    )
      errors.push("Onboarding matrix incomplete");
    if (
      report.cases[0].containerReplacement !== "passed" ||
      report.cases[1].downUpPersistence !== "passed" ||
      report.cases[1].health !== "healthy"
    )
      errors.push("Container persistence/health check failed");
    for (const c of report.cases.slice(2))
      if (
        c.initialAndIncrementalReads !== "passed" ||
        c.ttlPreserved !== true ||
        c.sourceAcksCaughtUp !== true ||
        c.targetWritable !== true ||
        !c.afterDetach.includes("master") ||
        c.keys.length !== (c.name === "redis" ? 1 : 3)
      )
        errors.push("Migration did not synchronize and cut over");
    const inventory = JSON.parse(
      readText("evidence/onboarding/0.1.0/sources.json"),
    );
    if (inventory.commit !== release.commit)
      errors.push("Onboarding sources use a different release");
    for (const s of inventory.sources)
      if (hash(readText(s.file)) !== s.sha256)
        errors.push("Onboarding source changed");
  } catch {
    errors.push("Malformed onboarding evidence");
  }
  return errors;
}
