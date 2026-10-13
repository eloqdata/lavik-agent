import { isDeepStrictEqual } from "node:util";
import { hash, readJson, readText } from "../content/repository";
import { manualEvidenceErrors } from "../manual/gate";
import { manualClients } from "../manual/repository";
import { ownerAuthorization, ownerAuthorizationErrors } from "./authorization";
import {
  stableRelease,
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
} = {}) {
  try {
    const errors: string[] = [];
    const names = [
      ...readText(
        "evidence/docs/0.1.0/sources/src_redis_command_table.cpp",
      ).matchAll(/\{"([^"]+)", CommandKind::/g),
    ]
      .map((match) => match[1].toUpperCase())
      .sort();
    const commands = stableCommandReport(),
      clients = stableClientReport();
    errors.push(
      ...manualEvidenceErrors(
        {
          names,
          cases: stableCases(),
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
        stableCatalog()
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
        `evidence/docs/0.1.0/operations-${layout}.json`,
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
    const install = readJson("evidence/docs/0.1.0/install.json") as {
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
    for (const pkg of stablePackages()) {
      const tested = install.packages.find(
        (item) => item.filename === pkg.filename,
      );
      if (tested?.status !== "passed" || tested.sha256 !== pkg.sha256)
        errors.push(`Unverified stable archive: ${pkg.filename}`);
    }
    for (const [file, digest] of Object.entries(install.fileHashes))
      if (hash(readText(file)) !== digest)
        errors.push(`Stable install instructions changed: ${file}`);
    const inventory = readJson("evidence/docs/0.1.0/source-inventory.json") as {
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
    const monitoring = readJson("evidence/docs/0.1.0/monitoring.json") as {
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
    const commits = readJson("evidence/docs/0.1.0/commits.json") as {
      head: string;
      total: number;
      commits: { sha: string }[];
    };
    if (
      commits.head !== stableRelease.commit ||
      commits.total !== 135 ||
      commits.commits.length !== 135 ||
      new Set(commits.commits.map((c) => c.sha)).size !== 135
    )
      errors.push("Invalid beta-to-stable commit inventory");
    for (const guide of [...stableGuides(), stableReleaseNotes()]) {
      for (const source of guide.sources)
        if (source !== "commits")
          readText(
            `evidence/docs/0.1.0/sources/${source.replaceAll("/", "_")}`,
          );
      for (const section of guide.sections)
        for (const block of section.blocks)
          if (block.type === "code") {
            if (block.file.includes(".."))
              errors.push("Invalid stable snippet path");
            else readText(block.file);
          }
    }
    if (requireAuthorization) errors.push(...ownerAuthorizationErrors());
    return errors;
  } catch (error) {
    return [`Stable documentation: ${String(error)}`];
  }
}
export function requireStableDocs() {
  const errors = stableDocumentationErrors();
  if (errors.length)
    throw new Error(
      `Stable documentation cannot be exported:\n${errors.join("\n")}`,
    );
  return ownerAuthorization();
}
