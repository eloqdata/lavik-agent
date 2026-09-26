import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { hash, readText, release } from "../content/repository";
export const aptManifest = JSON.parse(readText("packages/apt/manifest.json"));
export const aptInputs = () =>
  [
    ...fs
      .readdirSync("packaging/apt", { recursive: true })
      .map(String)
      .filter((f) => fs.statSync(`packaging/apt/${f}`).isFile())
      .map((f) => `packaging/apt/${f}`),
    "scripts/build-apt.sh",
    "scripts/stage-apt.ts",
    "scripts/verify-apt.py",
  ].sort();
export const aptReviewedFiles = () => [
  ...aptInputs(),
  ".gitignore",
  "packages/apt/manifest.json",
  "packages/apt/lavik-archive-keyring.asc",
  "packages/apt/repository.ts",
  "evidence/apt/0.1.0/verification.json",
  "apps/web/public/_headers",
  "tests/apt.test.ts",
  "docs/apt-publishing.md",
];
export function aptEvidenceErrors(
  report = JSON.parse(readText("evidence/apt/0.1.0/verification.json")),
) {
  const errors: string[] = [];
  try {
    if (
      report.status !== "passed" ||
      report.release !== release.release ||
      report.sourceCommit !== release.commit ||
      report.version !== aptManifest.version ||
      report.fingerprint !== aptManifest.fingerprint ||
      report.artifactSha256 !== aptManifest.artifact.sha256 ||
      !["arm64", "amd64"].includes(report.architecture) ||
      !/^sha256:[a-f0-9]{64}$/.test(report.imageId) ||
      !isDeepStrictEqual(
        report.fileHashes,
        Object.fromEntries(aptInputs().map((f) => [f, hash(readText(f))])),
      )
    )
      errors.push("APT execution is failed or stale");
    if (
      !isDeepStrictEqual(report.checks, [
        "PASS: lavik signed-install version service-unit write restart allocation conffile purge-reinstall",
        "PASS: lavik-standard signed-install version service-unit write restart allocation conffile purge-reinstall",
        "PASS: invalid signing key rejected",
      ])
    )
      errors.push("APT lifecycle/signature checks incomplete");
    if (
      aptManifest.release !== release.release ||
      aptManifest.sourceCommit !== release.commit ||
      aptManifest.version !== "0.1.0~beta.1-1" ||
      aptManifest.distribution !== "noble" ||
      !isDeepStrictEqual(aptManifest.architectures, ["amd64", "arm64"]) ||
      !/^[A-F0-9]{40}$/.test(aptManifest.fingerprint)
    )
      errors.push("Invalid APT release lock");
    const paths = aptManifest.files.map((f: any) => f.path);
    if (
      new Set(paths).size !== paths.length ||
      aptManifest.files.some(
        (f: any) =>
          f.path.includes("..") ||
          f.path.startsWith("/") ||
          !/^[a-f0-9]{64}$/.test(f.sha256) ||
          f.size <= 0 ||
          f.size >= 25 * 1024 * 1024,
      )
    )
      errors.push("Invalid APT asset manifest");
    for (const required of [
      "dists/noble/InRelease",
      "dists/noble/Release",
      "dists/noble/Release.gpg",
      "lavik-archive-keyring.asc",
      ...["amd64", "arm64"].flatMap((arch) => [
        `dists/noble/main/binary-${arch}/Packages`,
        `pool/main/l/lavik/lavik_0.1.0~beta.1-1_${arch}.deb`,
        `pool/main/l/lavik-standard/lavik-standard_0.1.0~beta.1-1_${arch}.deb`,
      ]),
    ])
      if (!paths.includes(required))
        errors.push(`Missing APT asset: ${required}`);
    if (
      aptManifest.files.find((f: any) => f.path === "lavik-archive-keyring.asc")
        ?.sha256 !== hash(readText("packages/apt/lavik-archive-keyring.asc"))
    )
      errors.push("APT public key mismatch");
    if (
      !aptManifest.artifact.url.startsWith(
        "https://github.com/eloqdata/lavik-agent/releases/download/apt-v0.1.0-beta.1-1/",
      ) ||
      !/^[a-f0-9]{64}$/.test(aptManifest.artifact.sha256)
    )
      errors.push("APT artifact is not locked");
  } catch {
    errors.push("Malformed APT verification evidence");
  }
  return errors;
}
