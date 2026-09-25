import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { release } from "../content/repository";
import { downloadEvidenceErrors } from "../content/downloads";
import {
  operationsEvidenceErrors,
  operationsReviewedFiles,
} from "../operations/repository";
import {
  quickStartEvidenceErrors,
  quickStartVerificationFiles,
} from "../quick-start/evidence";
import {
  useCaseEvidenceErrors,
  useCaseEvidenceFiles,
  scenarioFiles,
} from "../use-cases/repository";
import {
  manualCatalog,
  manualCases,
  manualClients,
  commandReport,
  clientReport,
  fileHash,
  readManualFile,
  type ManualCase,
  type ManualClient,
  type CommandReport,
  type ClientReport,
} from "./repository";

function matches(actual: unknown, rule: Record<string, unknown>): boolean {
  if ("equals" in rule) return isDeepStrictEqual(actual, rule.equals);
  if ("errorContains" in rule)
    return (
      typeof actual === "object" &&
      actual !== null &&
      "error" in actual &&
      typeof actual.error === "string" &&
      actual.error
        .toLowerCase()
        .includes(String(rule.errorContains).toLowerCase())
    );
  if (typeof actual === "object" && actual !== null && "error" in actual)
    return false;
  if ("contains" in rule)
    return typeof actual === "string"
      ? actual.includes(String(rule.contains))
      : Array.isArray(actual) && actual.includes(rule.contains);
  if ("nestedContains" in rule) {
    const search = (value: unknown): boolean =>
      value === rule.nestedContains ||
      (Array.isArray(value) && value.some(search));
    return search(actual);
  }
  if ("integerMin" in rule)
    return (
      Number.isInteger(actual) && Number(actual) >= Number(rule.integerMin)
    );
  if ("integerRange" in rule) {
    const range = rule.integerRange as number[];
    return (
      Number.isInteger(actual) &&
      Number(actual) >= range[0] &&
      Number(actual) <= range[1]
    );
  }
  if ("first" in rule) return Array.isArray(actual) && actual[0] === rule.first;
  if ("scanPairs" in rule) {
    if (
      !Array.isArray(actual) ||
      actual.length !== 2 ||
      actual[0] !== "0" ||
      !Array.isArray(actual[1])
    )
      return false;
    const expected = rule.scanPairs as Record<string, string>,
      pairs = actual[1];
    return (
      pairs.length === 2 * Object.keys(expected).length &&
      isDeepStrictEqual(
        Object.fromEntries(
          pairs
            .filter((_, i) => i % 2 === 0)
            .map((key, i) => [key, pairs[2 * i + 1]]),
        ),
        expected,
      )
    );
  }
  if ("type" in rule) return rule.type === "array" && Array.isArray(actual);
  if ("binaryMin" in rule) {
    if (typeof actual === "string")
      return Buffer.byteLength(actual) >= Number(rule.binaryMin);
    return (
      typeof actual === "object" &&
      actual !== null &&
      "base64" in actual &&
      typeof actual.base64 === "string" &&
      "bytes" in actual &&
      Buffer.from(actual.base64, "base64").length === actual.bytes &&
      Number(actual.bytes) >= Number(rule.binaryMin)
    );
  }
  if ("mapIncludes" in rule || "pairsInclude" in rule) {
    const record =
      "pairsInclude" in rule && Array.isArray(actual)
        ? Object.fromEntries(
            actual
              .filter((_, i) => i % 2 === 0)
              .map((k, i) => [k, actual[i * 2 + 1]]),
          )
        : actual;
    return (
      typeof record === "object" &&
      record !== null &&
      Object.entries(
        (rule.mapIncludes ?? rule.pairsInclude) as Record<string, unknown>,
      ).every(([k, v]) =>
        isDeepStrictEqual((record as Record<string, unknown>)[k], v),
      )
    );
  }
  if ("coordinatesNear" in rule)
    return (
      Array.isArray(actual) &&
      actual.length === 1 &&
      Array.isArray(actual[0]) &&
      actual[0].length === 2 &&
      (rule.coordinatesNear as number[]).every(
        (value, i) => Math.abs(Number(actual[0][i]) - value) < 0.00001,
      )
    );
  return false;
}

export function manualEvidenceErrors(bundle: {
  names: string[];
  cases: ManualCase[];
  commands: CommandReport;
  clients: ManualClient[];
  clientResults: ClientReport;
}) {
  const errors: string[] = [];
  function sameNames(label: string, expected: string[], actual: string[]) {
    if (
      new Set(actual).size !== actual.length ||
      !isDeepStrictEqual([...expected].sort(), [...actual].sort())
    )
      errors.push(`${label}: missing, duplicate or unexpected coverage`);
  }
  sameNames(
    "Command definitions",
    bundle.names,
    bundle.cases.map((c) => c.name),
  );
  sameNames(
    "Command receipts",
    bundle.names,
    bundle.commands.commands.map((c) => c.name),
  );
  for (const report of [bundle.commands, bundle.clientResults]) {
    if (
      report.status !== "passed" ||
      report.sourceCommit !== release.commit ||
      report.binaryVersion !== `lavik ${release.release}`
    )
      errors.push(
        "Execution report does not match the successful pinned release",
      );
    if (
      !/^sha256:[a-f0-9]{64}$/.test(report.imageId) ||
      !/^[a-f0-9]{64}$/.test(report.binarySha256)
    )
      errors.push("Missing Docker image or binary identity");
    if (
      !report.dockerArgv.includes("--network=none") ||
      !report.dockerArgv.includes("--read-only")
    )
      errors.push(
        "Execution report is not from the offline, read-only Docker fixture",
      );
  }
  if (bundle.commands.binarySha256 !== bundle.clientResults.binarySha256)
    errors.push("Commands and clients tested different binaries");
  if (bundle.commands.gracefulRestart !== "passed")
    errors.push("Graceful restart did not pass");
  for (const definition of bundle.cases) {
    const result = bundle.commands.commands.find(
      (c) => c.name === definition.name,
    );
    if (
      !result ||
      result.status !== "passed" ||
      result.scope !== definition.scope ||
      result.steps.length !== definition.steps.length
    ) {
      errors.push(`${definition.name}: incomplete case`);
      continue;
    }
    definition.steps.forEach((expected, index) => {
      const { actual, passed, iterations, ...instruction } =
        result.steps[index];
      if (
        !isDeepStrictEqual(instruction, expected) ||
        !passed ||
        !matches(actual, expected.expect)
      )
        errors.push(
          `${definition.name}: step ${index + 1} does not satisfy its recorded assertion`,
        );
      if (expected.scanAll) {
        if (!iterations?.length) {
          errors.push("SCAN: missing cursor traversal");
          return;
        }
        const keys = new Set<string>();
        let cursor = "0";
        for (const iteration of iterations) {
          if (
            !isDeepStrictEqual(
              iteration.argv,
              expected.argv!.map((arg, i) => (i === 1 ? cursor : arg)),
            )
          )
            errors.push("SCAN: wrong continuation cursor");
          if (
            !Array.isArray(iteration.actual) ||
            iteration.actual.length !== 2 ||
            typeof iteration.actual[0] !== "string" ||
            !Array.isArray(iteration.actual[1])
          ) {
            errors.push("SCAN: invalid reply");
            break;
          }
          cursor = iteration.actual[0];
          iteration.actual[1].forEach((key: string) => keys.add(key));
        }
        if (cursor !== "0" || !isDeepStrictEqual([...keys].sort(), actual))
          errors.push("SCAN: incomplete or inconsistent traversal");
      }
    });
  }
  sameNames(
    "Client receipts",
    bundle.clients.map((c) => c.id),
    bundle.clientResults.clients.map((c) => c.id),
  );
  sameNames(
    "Shutdown diagnostics",
    ["ioredis", "iovalkey"],
    bundle.clientResults.shutdownProbes.map((p) => p.id),
  );
  for (const probe of bundle.clientResults.shutdownProbes) {
    if (
      !["timeout", "completed", "failed"].includes(probe.outcome) ||
      probe.timeoutSeconds !== 12 ||
      !isDeepStrictEqual(probe.argv, [
        "node",
        "/clients/node-client.mjs",
        probe.id,
        "2",
        "--quit-probe",
      ])
    )
      errors.push(`${probe.id}: invalid shutdown diagnostic`);
  }
  for (const client of bundle.clients) {
    const result = bundle.clientResults.clients.find((c) => c.id === client.id);
    if (
      !result ||
      result.status !== "passed" ||
      result.version !== client.version ||
      !isDeepStrictEqual(result.argv, client.argv) ||
      !result.checks?.length
    )
      errors.push(
        `${client.id}: missing successful exact-version client evidence`,
      );
  }
  return errors;
}

export const manualReviewedPaths = () =>
  [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "apps/web/next.config.ts",
    "packages/content/repository.ts",
    "packages/content/schema.ts",
    "packages/content/gate.ts",
    "packages/content/publication-context.ts",
    "apps/web/components/content-v2.tsx",
    "evidence/sources.json",
    "content/claims.json",
    "verification/recipes.json",
    "tests/manual.test.ts",
    "tests/use-cases.test.ts",
    "scripts/review-blog-batch.ts",
    "tests/blog-series.test.ts",
    "packages/blog/topics.ts",
    "packages/blog/presentation.ts",
    "packages/blog/cover.ts",
    "content/blog-presentation.json",
    "apps/web/components/blog.tsx",
    "apps/web/components/blog.css",
    "apps/web/app/(entry)/blog-covers/[file]/route.ts",
    "packages/admin/publish.ts",
    "packages/agents/publish.ts",
    "policies/blog-writer.md",
    "policies/blog-reviewer.md",
    "tests/blog-presentation.test.ts",
    "tests/browser/blog-navigation.spec.ts",
    "docs/blog-presentation.md",
    "scripts/check-content.ts",
    ".github/workflows/ci.yml",
    "apps/web/app/(site)/[locale]/[...slug]/page.tsx",
    "apps/web/app/(entry)/manual-manifest.json/route.ts",
    "apps/web/app/(entry)/sitemap.ts",
    "content/releases/0.1.0.json",
    "content/manual/0.1.0/inventory.json",
    "content/manual/0.1.0/cases.json",
    "content/manual/0.1.0/catalog.json",
    "evidence/manual/0.1.0/command_table.cpp",
    "evidence/manual/0.1.0/request-serving.md",
    "evidence/manual/0.1.0/commands.json",
    "evidence/manual/0.1.0/clients.json",
    "packages/manual/repository.ts",
    "packages/manual/gate.ts",
    "apps/web/components/manual.tsx",
    "apps/web/components/manual.css",
    "apps/web/components/docs-home.tsx",
    "apps/web/components/docs-sidebar.tsx",
    "apps/web/components/docs-navigation.tsx",
    "apps/web/components/download-page.tsx",
    "apps/web/components/copy-code.tsx",
    "apps/web/components/community-page.tsx",
    "apps/web/components/site.tsx",
    "apps/web/components/use-cases-menu.tsx",
    "apps/web/components/use-cases.tsx",
    "apps/web/components/latency-explorer.tsx",
    "packages/use-cases/content.ts",
    "packages/use-cases/repository.ts",
    "packages/use-cases/measurements.ts",
    "evidence/use-cases/0.1.0/sources.json",
    "evidence/use-cases/0.1.0/scenarios.json",
    ...useCaseEvidenceFiles,
    ...scenarioFiles.filter(
      (f) =>
        ![
          "verification/manual/run.py",
          "verification/manual/cases.py",
        ].includes(f),
    ),
    "packages/content/downloads.ts",
    ...operationsReviewedFiles(),
    "packages/quick-start/evidence.ts",
    ...quickStartVerificationFiles.filter(
      (f) => f !== "verification/recipes.json",
    ),
    "apps/web/components/quick-start.tsx",
    "apps/web/components/quick-start-installer.tsx",
    "apps/web/components/quick-start.css",
    "evidence/quick-start/0.1.0/verification.json",
    "tests/quick-start.test.ts",
    "tests/browser/quick-start.spec.ts",
    "docs/quick-start-verification.md",
    "content/downloads/0.1.0.json",
    "scripts/verify-downloads.ts",
    "verification/downloads/Dockerfile",
    "evidence/downloads/0.1.0/README.md",
    "evidence/downloads/0.1.0/verification.json",
    "apps/web/components/command-search.tsx",
    "packages/local/codex.ts",
    "scripts/local-codex.ts",
    "scripts/verify-manual.py",
    "scripts/review-manual.ts",
    "docs/manual-workflow.md",
    "verification/manual/cases.py",
    "verification/manual/run.py",
    "verification/manual/client-run.py",
    ...fs
      .readdirSync("verification/manual/clients")
      .filter((name) =>
        fs.statSync(path.join("verification/manual/clients", name)).isFile(),
      )
      .map((name) => `verification/manual/clients/${name}`),
  ].sort();
export function manualFileHashes() {
  return Object.fromEntries(
    manualReviewedPaths().map((file) => [file, fileHash(file)]),
  );
}
export function manualBundleHash(files: Record<string, string>) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest("hex");
}
export interface ManualPublication {
  version: "0.1.0";
  release: string;
  sourceCommit: string;
  bundleHash: string;
  reviewedAt: string;
  reviewedFiles: Record<string, string>;
  review: {
    decision: "pass" | "changes_required";
    findings: { severity: "blocking" | "note"; message: string }[];
  };
  reviewer: {
    model: string;
    provider: string;
    authentication: string;
    promptSha256: string;
    outputSha256: string;
    reasoning: string;
  };
}
export function manualPublication() {
  return readManualFile<ManualPublication>(
    "evidence/manual/0.1.0/publication.json",
  );
}

// Required by both the page renderer and the exported manifest, so invoking
// Next directly cannot bypass the publication gate in npm/CI.
export function requireReviewedManual() {
  const errors = manualPublicationErrors();
  if (errors.length)
    throw new Error(`Manual cannot be exported:\n${errors.join("\n")}`);
  return manualPublication();
}

export function manualPublicationErrors({ requireReview = true } = {}) {
  try {
    const inventory = readManualFile<{
      commit: string;
      sourceSha256: string;
      commands: { name: string }[];
      additionalSources: { file: string; url: string; sha256: string }[];
    }>("content/manual/0.1.0/inventory.json");
    const commands = commandReport(),
      clients = clientReport(),
      catalog = manualCatalog();
    const errors = manualEvidenceErrors({
      names: inventory.commands.map((c) => c.name),
      cases: manualCases(),
      commands,
      clients: manualClients(),
      clientResults: clients,
    });
    errors.push(...downloadEvidenceErrors());
    errors.push(...quickStartEvidenceErrors());
    errors.push(...operationsEvidenceErrors());
    errors.push(...useCaseEvidenceErrors());
    if (
      inventory.commit !== release.commit ||
      inventory.sourceSha256 !==
        fileHash("evidence/manual/0.1.0/command_table.cpp")
    )
      errors.push("Pinned command source does not match inventory");
    for (const source of inventory.additionalSources) {
      if (
        !source.file.startsWith("evidence/manual/0.1.0/") ||
        source.file.includes("..") ||
        !source.url.startsWith(
          `https://github.com/eloqdata/lavik/blob/${release.commit}/`,
        ) ||
        fileHash(source.file) !== source.sha256
      )
        errors.push("Pinned behavioral source does not match inventory");
    }
    const sourceNames = [
      ...fs
        .readFileSync("evidence/manual/0.1.0/command_table.cpp", "utf8")
        .matchAll(/\{"([^"]+)", CommandKind::/g),
    ]
      .map((m) => m[1].toUpperCase())
      .sort();
    if (
      !isDeepStrictEqual(
        sourceNames,
        inventory.commands.map((c) => c.name).sort(),
      )
    )
      errors.push("Inventory omits registered source commands");
    if (
      !isDeepStrictEqual(
        sourceNames,
        catalog.commands.map((c) => c.name).sort(),
      )
    )
      errors.push("Writer catalog omits or duplicates command names");
    for (const report of [commands, clients])
      for (const [file, hash] of Object.entries(report.harnessFiles)) {
        if (
          !file.startsWith("verification/manual/") ||
          file.includes("..") ||
          fileHash(file) !== hash
        )
          errors.push(`${file}: execution harness changed after verification`);
      }
    for (const [file, hash] of Object.entries(clients.clientSourceFiles)) {
      if (
        file.includes("/") ||
        fileHash(`verification/manual/clients/${file}`) !== hash
      )
        errors.push(
          `${file}: executed client source differs from published example`,
        );
    }
    if (requireReview) {
      const publication = manualPublication(),
        files = manualFileHashes();
      if (
        publication.review.decision !== "pass" ||
        publication.review.findings.some((f) => f.severity === "blocking")
      )
        errors.push("Independent review has not passed");
      if (
        publication.sourceCommit !== release.commit ||
        publication.release !== release.release ||
        publication.version !== "0.1.0"
      )
        errors.push("Review covers a different release");
      if (
        !isDeepStrictEqual(publication.reviewedFiles, files) ||
        publication.bundleHash !== manualBundleHash(files)
      )
        errors.push("Manual changed after independent review");
      if (
        publication.reviewer.authentication !== "chatgpt" ||
        publication.reviewer.provider !== "openai" ||
        publication.reviewer.model !== "gpt-6-astra"
      )
        errors.push(
          "Review was not produced by the subscription-only local reviewer",
        );
    }
    return errors;
  } catch (error) {
    return [`Manual publication: ${(error as Error).message}`];
  }
}
