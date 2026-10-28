import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { hash, readJson, readText } from "../content/repository";
import { gunzipSync } from "node:zlib";

import { aptReviewedFiles } from "../apt/repository";

const directory = "evidence/docs/0.2.0";
export function containerBundleErrors() {
  try {
    const file =
        "apps/web/public/installation-assets/0.2.0/docker-source.tar.gz",
      compressed = fs.readFileSync(file);
    const digest = hash(compressed);
    if (
      !readText(`${file}.sha256`).startsWith(`${digest}  docker-source.tar.gz`)
    )
      return ["Container source bundle checksum changed"];
    for (const snippet of ["compose-download.sh"])
      if (!readText(`verification/docs/0.2.0/${snippet}`).includes(digest))
        return [
          "Container source download is not pinned to the published bundle",
        ];
    const tar = gunzipSync(compressed),
      files: Record<string, string> = {};
    for (let offset = 0; offset + 512 <= tar.length;) {
      const header = tar.subarray(offset, offset + 512);
      if (header.every((b) => b === 0)) break;
      const name = header.subarray(0, 100).toString().replace(/\0.*$/, ""),
        size = Number.parseInt(
          header.subarray(124, 136).toString().replace(/\0.*$/, "").trim(),
          8,
        ),
        type = header[156];
      if (
        !/^lavik-0\.2\.0-docker\/[a-zA-Z0-9._-]+$/.test(name) ||
        ![0, 48].includes(type) ||
        !Number.isSafeInteger(size) ||
        size < 0 ||
        offset + 512 + size > tar.length
      )
        return ["Invalid container source archive entry"];
      const relative = name.split("/")[1];
      if (relative === ".." || files[relative])
        return ["Invalid or duplicate container build source"];
      files[relative] = hash(tar.subarray(offset + 512, offset + 512 + size));
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    const expected = Object.fromEntries(
      fs
        .readdirSync("packaging/docker/0.2.0", { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => [
          e.name,
          hash(fs.readFileSync(`packaging/docker/0.2.0/${e.name}`)),
        ]),
    );
    if (
      !isDeepStrictEqual(
        Object.fromEntries(Object.entries(files).sort()),
        Object.fromEntries(Object.entries(expected).sort()),
      )
    )
      return ["Published container bundle differs from tested build sources"];
    return [];
  } catch (error) {
    return [`Container source bundle: ${String(error)}`];
  }
}
export const documentationReviewFiles = () => {
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.name !== "__pycache__" && !e.name.endsWith(".pyc"))
      .flatMap((e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      );
  return [
    ...new Set([
      ...[
        "content/docs/0.2.0",
        directory,
        "verification/docs/0.2.0",
        "packaging/docker/0.2.0",
        "apps/web/public/installation-assets/0.2.0",
      ].flatMap(walk),
      ...["manual", "install", "operations", "monitoring", "migration"].map(
        (name) => `scripts/verify-020-${name}.py`,
      ),
      "apps/web/app/(entry)/manual-manifest.json/route.ts",
      "apps/web/components/adoption-faq.tsx",
      "apps/web/components/use-cases.tsx",
      "apps/web/components/release-badge.tsx",
      "apps/web/components/site.tsx",
      "apps/web/components/github-star.tsx",
      "packages/content/schema.ts",
      "packages/editorial/faq.ts",
      "packages/use-cases/content.ts",
      "packages/docs/stable.ts",
      "packages/docs/versions.ts",
      "packages/docs/gate.ts",
      "packages/docs/publication.ts",
      "apps/web/components/stable-guide.tsx",
      "apps/web/components/docs-home.tsx",
      "apps/web/components/docs-sidebar.tsx",
      "apps/web/components/manual.tsx",
      "apps/web/components/download-page.tsx",
      "apps/web/components/doc-version-select.tsx",
      "packages/seo/site.ts",
      "apps/web/app/(entry)/sitemap.ts",
      "scripts/build-discovery.ts",
      "scripts/check-content.ts",
      "apps/web/app/(site)/[locale]/[...slug]/page.tsx",
      "apps/web/public/_redirects",
      "tests/docs-versions.test.ts",
      "tests/release-020.test.ts",
      "tests/container-download.test.ts",
      "tests/browser/docs-versions.spec.ts",
      "tests/browser/release-020.spec.ts",
      "scripts/review-release-020.ts",
      "scripts/review-release-020-packaging.ts",
      ...aptReviewedFiles(),
      ".github/workflows/release-artifacts.yml",
      "scripts/review-release-020-manifest.ts",
      "packages/local/codex.ts",
      "tests/local-codex.test.ts",
      "tests/browser/manual.spec.ts",
      "packages/benchmarks/review-lock.ts",
      "packages/comparisons/review-lock.ts",
      "packages/marketing/process-lock.ts",
    ]),
  ]
    .filter(
      (f) =>
        ![`${directory}/publication.json`, `${directory}/review.json`].includes(
          f,
        ),
    )
    .sort();
};
export const documentationFileHashes = () =>
  Object.fromEntries(
    documentationReviewFiles().map((file) => [
      file,
      hash(fs.readFileSync(file)),
    ]),
  );
export const documentationBundleHash = (files: Record<string, string>) =>
  hash(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
export function documentationPublication() {
  return readJson(`${directory}/publication.json`) as {
    schemaVersion: number;
    reviewedFiles: Record<string, string>;
    bundleHash: string;
    reviewSha256: string;
    reviewer: {
      role: string;
      provider: string;
      authentication: string;
      outputSha256: string;
    };
  };
}
export function documentationPublicationErrors() {
  try {
    const record = documentationPublication(),
      raw = readText(`${directory}/review.json`),
      review = JSON.parse(raw);
    if (
      record.schemaVersion !== 1 ||
      record.reviewer.role !== "reviewer" ||
      record.reviewer.provider !== "openai" ||
      record.reviewer.authentication !== "chatgpt" ||
      review.decision !== "pass" ||
      review.findings.some(
        (f: { severity: string }) => f.severity === "blocking",
      )
    )
      return ["0.2.0 documentation has no passing independent review"];
    if (
      record.reviewSha256 !== hash(raw) ||
      record.reviewer.outputSha256 !== hash(raw) ||
      record.bundleHash !== documentationBundleHash(record.reviewedFiles) ||
      !isDeepStrictEqual(record.reviewedFiles, documentationFileHashes())
    )
      return ["0.2.0 documentation changed after independent review"];
    return [];
  } catch (error) {
    return [`0.2.0 documentation publication unavailable: ${String(error)}`];
  }
}
