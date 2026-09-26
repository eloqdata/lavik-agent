import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { hash, readText, release } from "../content/repository";
const text = z
  .object({ en: z.string().min(1), "zh-CN": z.string().min(1) })
  .strict();
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text }).strict(),
  z
    .object({
      type: z.literal("docker-file"),
      name: z.enum([
        "single-start.sh",
        "single-connect.sh",
        "single-restart.sh",
        "compose-download.sh",
        "compose-connect.sh",
        "compose-failover.sh",
        "compose-restart.sh",
      ]),
    })
    .strict(),
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
  ...dockerImageReviewedFiles(),
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

export const dockerPackagingCommit = "a1770a78b52e0bb9ec32e20b92af6282e73efabd";
export const dockerImageFiles = () =>
  [
    ...["upstream", "examples"].flatMap((dir) =>
      fs
        .readdirSync(`verification/docker-images/${dir}`)
        .sort()
        .map((name) => `verification/docker-images/${dir}/${name}`),
    ),
    "scripts/verify-docker-images.py",
  ].sort();
export const dockerImageReviewedFiles = () => [
  ...dockerImageFiles(),
  "evidence/docker-images/0.1.0/verification.json",
];
export function dockerImageErrors(
  report = JSON.parse(
    readText("evidence/docker-images/0.1.0/verification.json"),
  ),
) {
  const errors: string[] = [];
  try {
    if (
      report.status !== "passed" ||
      report.version !== release.release ||
      report.sourceCommit !== release.commit ||
      report.packagingCommit !== dockerPackagingCommit ||
      !["linux/arm64", "linux/amd64"].includes(report.platform) ||
      !isDeepStrictEqual(
        report.fileHashes,
        Object.fromEntries(
          dockerImageFiles().map((f) => [f, hash(readText(f))]),
        ),
      )
    )
      errors.push("Official Docker image execution is failed or stale");
    if (
      !isDeepStrictEqual(
        report.images.map((i: any) => i.tag),
        ["eloqdata/lavik:0.1.0-beta.1", "eloqdata/lavik:0.1.0-beta.1-cluster"],
      ) ||
      report.images.some(
        (i: any) =>
          !/^sha256:[a-f0-9]{64}$/.test(i.imageId) ||
          !/^[a-f0-9]{64}$/.test(i.binarySha256) ||
          i.revision !== release.commit ||
          i.version !== `lavik ${release.release}` ||
          `linux/${i.architecture}` !== report.platform ||
          !i.repoDigests?.some((d: string) =>
            /^eloqdata\/lavik@sha256:[a-f0-9]{64}$/.test(d),
          ),
      )
    )
      errors.push("Official Docker image identity missing or mismatched");
    const checks = [
      "standalone recovery preserves data and allocation",
      "cluster bootstrap",
      "cluster READY",
      "follower receives writes",
      "follower promoted by lavik-ctl",
      "old primary follows new primary",
      "bootstrap accepts recovered state",
      "recovered cluster READY",
      "cluster recovery preserves Genesis and data, and serves writes",
    ];
    if (
      !isDeepStrictEqual(report.checks, checks) ||
      checks.some((c) => !report.stdout.includes(`PASS: ${c}`))
    )
      errors.push(
        "Official Docker persistence, replication or recovery checks incomplete",
      );
  } catch {
    errors.push("Malformed official Docker evidence");
  }
  return errors;
}
