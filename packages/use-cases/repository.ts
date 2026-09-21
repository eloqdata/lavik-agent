import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { hash, readText, release, sources } from "../content/repository";
import { commandReport } from "../manual/repository";
import { useCases } from "./content";
import { storageSystems, type StoragePoint } from "./measurements";

export const benchmarkRevision = "053042361a194ea53d1d7631ebb6c8b05e425786";
export const storageReportUrl = `https://github.com/eloqdata/lavik/blob/${benchmarkRevision}/perf_reports/lavik-v0.1.0-beta.1-spdk-vs-peers-2026-09-18/README.md`;
export const historicalReportUrl = sources.find(
  (s) => s.id === "tiering-cost",
)!.url;
export const storageCsvUrl = storageReportUrl.replace(
  "README.md",
  "storage-results.csv",
);
export const scenarioFiles = [
  "scripts/verify-use-cases.py",
  "verification/use-cases/run.py",
  "verification/use-cases/scenarios.json",
  "verification/manual/run.py",
  "verification/manual/cases.py",
];
export const useCaseEvidenceFiles = [
  "evidence/use-cases/0.1.0/beta-storage-report.md",
  "evidence/use-cases/0.1.0/storage-results.csv",
  "evidence/use-cases/0.1.0/control-provenance.json",
  "evidence/use-cases/0.1.0/binaries.json",
  "evidence/use-cases/0.1.0/competitor-notes.json",
  "evidence/sources/tiering-cost.txt",
  "evidence/sources/storage.txt",
  "evidence/sources/architecture.txt",
  "evidence/sources/benchmark-spdk.txt",
  "evidence/sources/benchmark-spdk-data.txt",
];
const number = z.coerce.number().finite().positive();
const pointSchema = z.object({
  system: z.enum(["lavik-spdk", "dragonfly", "garnet"]),
  workload: z.enum(["GET", "SET"]),
  qps: number,
  p99: number,
  p999: number,
  connections: z.coerce.number().int().positive(),
});
export function storagePoints(): StoragePoint[] {
  const [header, ...rows] = readText(
    "evidence/use-cases/0.1.0/storage-results.csv",
  )
    .trim()
    .split(/\r?\n/);
  const columns = header.split(",");
  return rows.map((row) => {
    const fields = row.split(",");
    if (fields.length !== columns.length)
      throw new Error("Malformed storage CSV row");
    const values = Object.fromEntries(
      columns.map((name, i) => [name, fields[i]]),
    );
    if (
      values.group !== "storage" ||
      values.keys !== "1000000000" ||
      values.value_bytes !== "1024" ||
      values.test_seconds !== "60" ||
      values.connection_errors !== "0"
    )
      throw new Error("Unexpected storage benchmark scope");
    return pointSchema.parse({
      ...values,
      p99: values.p99_ms,
      p999: values.p999_ms,
    });
  });
}
export function historicalRows() {
  const systems = ["Lavik SPDK", "Dragonfly Tiered Storage", "Apache Kvrocks"];
  const workloads = ["Read-only GET", "Write-only SET", "1:1 read/write"];
  return readText("evidence/sources/tiering-cost.txt")
    .split("\n")
    .flatMap((line) => {
      const fields = line.split("|").map((s) => s.trim());
      if (
        fields.length !== 7 ||
        !workloads.includes(fields[1]) ||
        !systems.includes(fields[2])
      )
        return [];
      return [
        {
          workload: fields[1],
          system: fields[2],
          qps: number.parse(fields[3].replaceAll(",", "")),
          p99: number.parse(fields[4]),
          p999: number.parse(fields[5]),
        },
      ];
    });
}
const step = z
  .object({
    argv: z.array(z.string()).min(1),
    expect: z.union([
      z.object({ equals: z.unknown() }).strict(),
      z.object({ integerRange: z.tuple([z.number(), z.number()]) }).strict(),
    ]),
  })
  .strict();
const scenarioSchema = z
  .object({
    name: z.string(),
    scope: z.literal("functional-example"),
    steps: z.array(step).min(1),
  })
  .strict();
export function scenarioDefinitions() {
  return scenarioSchema
    .array()
    .parse(JSON.parse(readText("verification/use-cases/scenarios.json")));
}
const reportSchema = z
  .object({
    status: z.literal("passed"),
    sourceCommit: z.string(),
    binaryVersion: z.string(),
    binarySha256: z.string().regex(/^[a-f0-9]{64}$/),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    architecture: z.string(),
    platform: z.string(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    harnessFiles: z.record(z.string(), z.string()),
    dockerArgv: z.array(z.string()),
    serverArgv: z.array(z.string()),
    scenarios: z.array(
      z
        .object({
          name: z.string(),
          scope: z.literal("functional-example"),
          status: z.literal("passed"),
          steps: z
            .array(
              step.extend({ actual: z.unknown(), passed: z.literal(true) }),
            )
            .min(1),
        })
        .strict(),
    ),
  })
  .strict();
export function scenarioReport() {
  return reportSchema.parse(
    JSON.parse(readText("evidence/use-cases/0.1.0/scenarios.json")),
  );
}

export function useCaseEvidenceErrors(): string[] {
  try {
    const errors: string[] = [];
    const manifest = z
      .object({
        revision: z.literal(benchmarkRevision),
        checkedAt: z.literal("2026-09-21"),
        fileHashes: z.record(z.string(), z.string()),
      })
      .strict()
      .parse(JSON.parse(readText("evidence/use-cases/0.1.0/sources.json")));
    if (
      !isDeepStrictEqual(
        Object.keys(manifest.fileHashes).sort(),
        [...useCaseEvidenceFiles].sort(),
      )
    )
      errors.push("Use cases: incomplete source manifest");
    for (const file of useCaseEvidenceFiles)
      if (manifest.fileHashes[file] !== hash(readText(file)))
        errors.push(`Use cases: source changed: ${file}`);
    const points = storagePoints();
    for (const system of storageSystems)
      for (const workload of ["GET", "SET"] as const) {
        if (
          !isDeepStrictEqual(
            points
              .filter((p) => p.system === system.id && p.workload === workload)
              .map((p) => p.connections)
              .sort((a, b) => a - b),
            [80, 160, 320, 640, 1280, 2560],
          )
        )
          errors.push("Use cases: incomplete or duplicated connection sweep");
      }
    if (historicalRows().length !== 9)
      errors.push("Use cases: incomplete historical table");
    const report = scenarioReport(),
      definitions = scenarioDefinitions(),
      manual = commandReport();
    if (
      report.sourceCommit !== release.commit ||
      report.binaryVersion !== `lavik ${release.release}` ||
      report.binarySha256 !== manual.binarySha256 ||
      report.imageId !== manual.imageId
    )
      errors.push(
        "Use cases: scenario binary differs from the verified release",
      );
    if (
      !report.dockerArgv.includes("--network=none") ||
      !report.dockerArgv.includes("--read-only") ||
      report.dockerArgv.includes("--env-file")
    )
      errors.push("Use cases: missing offline Docker isolation");
    if (
      !isDeepStrictEqual(
        Object.keys(report.harnessFiles).sort(),
        [...scenarioFiles].sort(),
      )
    )
      errors.push("Use cases: incomplete verifier hashes");
    for (const file of scenarioFiles)
      if (report.harnessFiles[file] !== hash(readText(file)))
        errors.push(`Use cases: stale execution evidence: ${file}`);
    const ids = useCases.map((c) => c.slug).sort();
    if (
      new Set(ids).size !== ids.length ||
      !isDeepStrictEqual(definitions.map((c) => c.name).sort(), ids) ||
      !isDeepStrictEqual(report.scenarios.map((c) => c.name).sort(), ids)
    )
      errors.push("Use cases: every page needs exactly one executed scenario");
    for (const entry of useCases) {
      const definition = definitions.find((d) => d.name === entry.slug),
        result = report.scenarios.find((s) => s.name === entry.slug);
      if (
        !definition ||
        !result ||
        !isDeepStrictEqual(
          result.steps.map(({ actual: _a, passed: _p, ...s }) => s),
          definition.steps,
        )
      ) {
        errors.push(`Use cases: scenario steps changed: ${entry.slug}`);
        continue;
      }
      for (const s of result.steps) {
        const valid =
          "equals" in s.expect
            ? isDeepStrictEqual(s.actual, s.expect.equals)
            : Number.isInteger(s.actual) &&
              Number(s.actual) >= s.expect.integerRange[0] &&
              Number(s.actual) <= s.expect.integerRange[1];
        if (!valid)
          errors.push(`Use cases: incorrect recorded reply: ${entry.slug}`);
      }
      if (
        !isDeepStrictEqual(
          [...new Set(definition.steps.map((s) => s.argv[0]))].sort(),
          [...entry.commands].sort(),
        )
      )
        errors.push(
          `Use cases: displayed command list differs from execution: ${entry.slug}`,
        );
      for (const command of entry.commands)
        if (
          !manual.commands.some(
            (c) =>
              c.name === command &&
              c.status === "passed" &&
              c.scope !== "rejection-only",
          )
        )
          errors.push(`Use cases: unsupported command: ${command}`);
      for (const related of entry.related)
        if (!ids.includes(related) || related === entry.slug)
          errors.push(`Use cases: invalid related page: ${related}`);
    }
    return errors;
  } catch (error) {
    return [`Use-case evidence is missing or invalid: ${String(error)}`];
  }
}
