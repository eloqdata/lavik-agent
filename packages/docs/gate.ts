import { defaultDocVersion, type StableDocVersion } from "./versions";
import {
  documentationPublication,
  documentationPublicationErrors,
  containerBundleErrors,
} from "./publication";
import { isDeepStrictEqual } from "node:util";
import { hash, readJson, readText } from "../content/repository";
import { manualEvidenceErrors } from "../manual/gate";
import { manualClients } from "../manual/repository";
import { ownerAuthorization, ownerAuthorizationErrors } from "./authorization";
import {
  stableReleaseFor,
  stableCatalog,
  stableCases,
  stableClientReport,
  stableCommandReport,
  stableGuides,
  stableReleaseNotes,
  stablePackages,
} from "./stable";

export function stableDocumentationErrors({
  requireAuthorization = true,
  version = defaultDocVersion as StableDocVersion,
} = {}) {
  try {
    const errors: string[] = [];
    const stableRelease = stableReleaseFor(version);
    const names = [
      ...readText(
        `evidence/docs/${version}/sources/src_redis_command_table.cpp`,
      ).matchAll(/\{"([^"]+)", CommandKind::/g),
    ]
      .map((match) => match[1].toUpperCase())
      .sort();
    const commands = stableCommandReport(version),
      clients = stableClientReport(version);
    errors.push(
      ...manualEvidenceErrors(
        {
          names,
          cases: stableCases(version),
          commands,
          clients: manualClients(),
          clientResults: clients,
        },
        stableRelease,
      ),
    );
    if (
      !isDeepStrictEqual(
        names,
        stableCatalog(version)
          .commands.map((command) => command.name)
          .sort(),
      )
    )
      errors.push("Stable catalog omits a registered command");
    for (const report of [commands, clients])
      for (const [file, digest] of Object.entries(report.harnessFiles))
        if (hash(readText(file)) !== digest)
          errors.push(`Stable verification harness changed: ${file}`);
    for (const [file, digest] of Object.entries(clients.clientSourceFiles))
      if (hash(readText(`verification/manual/clients/${file}`)) !== digest)
        errors.push(`Stable client source changed: ${file}`);
    for (const layout of ["single", "ha"]) {
      const report = readJson(
        `evidence/docs/${version}/operations-${layout}.json`,
      ) as {
        status: string;
        sourceCommit: string;
        gracefulRestart: string;
        fileHashes: Record<string, string>;
        controlledFailover?: unknown;
        automaticFailover?: unknown;
      };
      if (
        report.status !== "passed" ||
        report.sourceCommit !== stableRelease.commit ||
        report.gracefulRestart !== "passed" ||
        (layout === "ha" &&
          (!report.controlledFailover || !report.automaticFailover))
      )
        errors.push(`Incomplete stable operations evidence: ${layout}`);
      for (const [file, digest] of Object.entries(report.fileHashes))
        if (hash(readText(file)) !== digest)
          errors.push(`Stable operations example changed: ${file}`);
    }
    const install = readJson(`evidence/docs/${version}/install.json`) as {
      status: string;
      sourceCommit: string;
      fileHashes: Record<string, string>;
      packages: { filename: string; sha256: string; status: string }[];
    };
    if (
      install.status !== "passed" ||
      install.sourceCommit !== stableRelease.commit ||
      install.packages.length !== 4
    )
      errors.push("Incomplete stable installation evidence");
    for (const pkg of stablePackages(version)) {
      const tested = install.packages.find(
        (item) => item.filename === pkg.filename,
      );
      if (tested?.status !== "passed" || tested.sha256 !== pkg.sha256)
        errors.push(`Unverified stable archive: ${pkg.filename}`);
    }
    for (const [file, digest] of Object.entries(install.fileHashes))
      if (hash(readText(file)) !== digest)
        errors.push(`Stable install instructions changed: ${file}`);
    const inventory = readJson(
      `evidence/docs/${version}/source-inventory.json`,
    ) as {
      commit: string;
      sources: { file: string; url: string; sha256: string }[];
    };
    if (inventory.commit !== stableRelease.commit)
      errors.push("Stable sources use a different commit");
    for (const source of inventory.sources)
      if (
        !source.url.startsWith(
          `https://github.com/eloqdata/lavik/blob/${stableRelease.commit}/`,
        ) ||
        hash(readText(source.file)) !== source.sha256
      )
        errors.push(`Stable source mismatch: ${source.file}`);
    const monitoring = readJson(`evidence/docs/${version}/monitoring.json`) as {
      status: string;
      sourceCommit: string;
      fileHashes: Record<string, string>;
    };
    if (
      monitoring.status !== "passed" ||
      monitoring.sourceCommit !== stableRelease.commit
    )
      errors.push("Stable monitoring did not pass");
    for (const [file, digest] of Object.entries(monitoring.fileHashes))
      if (hash(readText(file)) !== digest)
        errors.push(`Stable monitoring inputs changed: ${file}`);
    const migration = readJson(`evidence/docs/${version}/migration.json`) as {
      status: string;
      sourceCommit: string;
      fileHashes: Record<string, string>;
      runs: {
        source: string;
        target: string;
        status: string;
        redisVersion: string;
        redisShakeVersion: string;
      }[];
    };
    if (
      migration.status !== "passed" ||
      migration.sourceCommit !== stableRelease.commit ||
      migration.runs.length !== 4 ||
      new Set(migration.runs.map((run) => `${run.source}/${run.target}`))
        .size !== 4 ||
      migration.runs.some(
        (run) =>
          run.status !== "passed" ||
          run.redisVersion !== "7.2.14" ||
          run.redisShakeVersion !== "4.6.2",
      )
    )
      errors.push("Incomplete stable RedisShake migration evidence");
    for (const [file, digest] of Object.entries(migration.fileHashes))
      if (hash(readText(file)) !== digest)
        errors.push(`Stable migration instructions changed: ${file}`);
    const migrationInstaller = readJson(
      `evidence/docs/${version}/migration-installer.json`,
    ) as {
      status: string;
      redisShakeVersion: string;
      fileHashes: Record<string, string>;
    };
    if (
      migrationInstaller.status !== "passed" ||
      migrationInstaller.redisShakeVersion !== "4.6.2"
    )
      errors.push("Incomplete RedisShake installer evidence");
    for (const [file, digest] of Object.entries(migrationInstaller.fileHashes))
      if (hash(readText(file)) !== digest)
        errors.push(`RedisShake installer changed: ${file}`);
    if (version === "0.2.0") {
      errors.push(...containerBundleErrors());
      const docker = readJson("evidence/docs/0.2.0/docker.json") as {
        status: string;
        images: Record<string, { configDigest: string }>;
        fileHashes: Record<string, string>;
      };
      if (
        docker.status !== "passed" ||
        !docker.images["lavik:0.2.0"] ||
        !docker.images["lavik:0.2.0-cluster"]
      )
        errors.push("0.2.0 container examples lack passing execution evidence");
      for (const [file, digest] of Object.entries(docker.fileHashes))
        if (hash(readText(`packaging/docker/0.2.0/${file}`)) !== digest)
          errors.push(`0.2.0 Docker input changed: ${file}`);
    }
    const commits = readJson(`evidence/docs/${version}/commits.json`) as {
      head: string;
      total: number;
      commits: { sha: string }[];
    };
    if (
      commits.head !== stableRelease.commit ||
      commits.total !== (version === "0.1.0" ? 135 : 47) ||
      commits.commits.length !== commits.total ||
      new Set(commits.commits.map((c) => c.sha)).size !== commits.total
    )
      errors.push("Invalid release commit inventory");
    for (const guide of [
      ...stableGuides(version),
      stableReleaseNotes(version),
    ]) {
      for (const source of guide.sources)
        if (source !== "commits")
          readText(
            `evidence/docs/${version}/sources/${source.replaceAll("/", "_")}`,
          );
      for (const section of guide.sections)
        for (const block of section.blocks)
          if (block.type === "code") {
            if (block.file.includes(".."))
              errors.push("Invalid stable snippet path");
            else readText(block.file);
          }
    }
    if (requireAuthorization)
      errors.push(
        ...(version === "0.1.0"
          ? ownerAuthorizationErrors()
          : documentationPublicationErrors()),
      );
    return errors;
  } catch (error) {
    return [`Stable documentation: ${String(error)}`];
  }
}
export function requireStableDocs(
  version: StableDocVersion = defaultDocVersion,
) {
  const errors = stableDocumentationErrors({ version });
  if (errors.length)
    throw new Error(
      `Stable documentation cannot be exported:\n${errors.join("\n")}`,
    );
  return version === "0.1.0"
    ? ownerAuthorization()
    : documentationPublication();
}
