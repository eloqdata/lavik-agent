import metadata from "../../content/downloads/0.1.0.json";
import { z } from "zod";
import { release, readText, hash } from "./repository";

if (metadata.tag_name !== release.tag || !metadata.prerelease)
  throw new Error("Download metadata must match the pinned beta release");

export const downloadRelease = metadata;
export const downloadPackages = (["minimal", "standard"] as const).flatMap(
  (variant) =>
    (["x86_64", "aarch64"] as const).map((arch) => {
      const filename = `lavik-${release.tag}-linux-${arch}${variant === "minimal" ? "-minimal" : ""}.tar.gz`;
      const asset = metadata.assets.find((a) => a.name === filename);
      const checksum = metadata.assets.find(
        (a) => a.name === `${filename}.sha256`,
      );
      if (!asset || !checksum || !/^sha256:[a-f0-9]{64}$/.test(asset.digest))
        throw new Error(`Missing download or checksum: ${filename}`);
      const url = `https://github.com/eloqdata/lavik/releases/download/${release.tag}/${filename}`;
      if (
        asset.browser_download_url !== url ||
        checksum.browser_download_url !== `${url}.sha256`
      )
        throw new Error(`Unexpected release URL: ${filename}`);
      const sha256 = asset.digest.slice(7);
      if (variant === "minimal" && sha256 !== release.artifacts[arch].sha256)
        throw new Error(
          `Download checksum differs from verified release: ${filename}`,
        );
      return {
        arch,
        variant,
        filename,
        url,
        sha256,
        checksumUrl: checksum.browser_download_url,
        size: asset.size,
        commands: `curl -fLO --retry 3 ${url} &&\ncurl -fLO --retry 3 ${checksum.browser_download_url} &&\nsha256sum -c ${filename}.sha256 &&\ntar -xzf ${filename}`,
      };
    }),
);

export const downloadVerificationPaths = [
  "scripts/verify-downloads.ts",
  "verification/downloads/Dockerfile",
  "packages/content/downloads.ts",
  "content/downloads/0.1.0.json",
];
const verificationSchema = z
  .object({
    release: z.string(),
    verifiedAt: z.iso.datetime(),
    platform: z.literal("Linux Docker"),
    imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scope: z.string().min(1),
    fileHashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
    packages: z.array(
      z
        .object({
          filename: z.string(),
          sha256: z.string(),
          commands: z.string(),
          status: z.literal("passed"),
          stdout: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

export function downloadEvidenceErrors(input?: unknown): string[] {
  try {
    const report = verificationSchema.parse(
      input ??
        JSON.parse(readText("evidence/downloads/0.1.0/verification.json")),
    );
    const errors: string[] = [];
    if (report.release !== release.tag)
      errors.push("Download evidence: wrong release");
    if (
      report.packages
        .map((p) => p.filename)
        .sort()
        .join("\n") !==
      downloadPackages
        .map((p) => p.filename)
        .sort()
        .join("\n")
    )
      errors.push("Download evidence: expected exactly four distinct packages");
    for (const pkg of downloadPackages) {
      const actual = report.packages.find((p) => p.filename === pkg.filename);
      if (
        !actual ||
        actual.sha256 !== pkg.sha256 ||
        actual.commands !== pkg.commands ||
        actual.stdout !== `${pkg.filename}: OK`
      )
        errors.push(`Download evidence: mismatched result for ${pkg.filename}`);
    }
    if (
      Object.keys(report.fileHashes).sort().join("\n") !==
      [...downloadVerificationPaths].sort().join("\n")
    )
      errors.push(
        "Download evidence: missing or unexpected verification input hashes",
      );
    for (const file of downloadVerificationPaths)
      if (report.fileHashes[file] !== hash(readText(file)))
        errors.push(`Download evidence: ${file} changed after execution`);
    return errors;
  } catch (error) {
    return [`Download evidence is missing or invalid: ${String(error)}`];
  }
}
