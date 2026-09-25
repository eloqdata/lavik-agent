import { isDeepStrictEqual } from "node:util";
import {
  hash,
  readText,
  release,
  recipes,
  harnessHash,
} from "../content/repository";
import { quickStartPackages, quickStartDependencies } from "./content";

export const quickStartVerificationFiles = [
  "packages/quick-start/content.ts",
  "scripts/verify-quick-start.ts",
  "verification/quick-start/Dockerfile",
  "verification/Dockerfile",
  "verification/start.sh",
  "verification/run.py",
  "verification/recipes.json",
];
export const quickStartInputHashes = () =>
  Object.fromEntries(
    quickStartVerificationFiles.map((f) => [f, hash(readText(f))]),
  );
export function quickStartReport() {
  return JSON.parse(readText("evidence/quick-start/0.1.0/verification.json"));
}
export function quickStartEvidenceErrors(
  report = quickStartReport(),
): string[] {
  const errors: string[] = [];
  try {
    if (
      report.release !== release.release ||
      report.sourceCommit !== release.commit ||
      report.harnessHash !== harnessHash()
    )
      errors.push("Quick start: release or executed harness changed");
    if (
      !isDeepStrictEqual(report.fileHashes, quickStartInputHashes()) ||
      !isDeepStrictEqual(report.dependencies, quickStartDependencies)
    )
      errors.push("Quick start: installation commands changed after execution");
    if (!["aarch64", "x86_64"].includes(report.nativeArch))
      errors.push("Quick start: unknown native runtime architecture");
    if (
      !isDeepStrictEqual(
        report.packages.map((p: any) => p.filename).sort(),
        quickStartPackages.map((p) => p.filename).sort(),
      )
    )
      errors.push("Quick start: incomplete or duplicate package coverage");
    for (const pkg of quickStartPackages) {
      const actual = report.packages.find(
        (p: any) => p.filename === pkg.filename,
      );
      if (
        !actual ||
        actual.sha256 !== pkg.sha256 ||
        actual.commands !== pkg.commands ||
        actual.status !== "passed" ||
        !/^sha256:[a-f0-9]{64}$/.test(actual.imageId) ||
        actual.binaryVersion !== `lavik ${release.release}` ||
        actual.sourceCommit !== release.commit ||
        actual.executableOnPath !== false
      )
        errors.push(
          `Quick start: missing verified installation for ${pkg.filename}`,
        );
      if (pkg.arch === report.nativeArch) {
        const runtime = actual?.runtime;
        const expected = recipes.find((r) => r.id === "basic-commands")!;
        if (
          !runtime ||
          runtime.status !== "passed" ||
          runtime.sourceCommit !== release.commit ||
          runtime.binaryVersion !== `lavik ${release.release}` ||
          runtime.packageVersion !== release.tag ||
          runtime.gracefulRestart !== "passed" ||
          runtime.executableOnPath !== false ||
          runtime.workingDirectory !== `/tmp/${pkg.directory}` ||
          !isDeepStrictEqual(
            runtime.steps,
            expected.steps.map((s) => ({ ...s, actual: s.expected })),
          )
        )
          errors.push(
            `Quick start: missing native startup and restart evidence for ${pkg.filename}`,
          );
      } else if (actual?.runtime !== null)
        errors.push(
          "Quick start: emulated runtime cannot be labeled as a native test",
        );
    }
  } catch {
    errors.push("Quick start: malformed execution report");
  }
  return errors;
}
