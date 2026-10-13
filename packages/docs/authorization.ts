import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { hash, readJson, readText } from "../content/repository";

export const ownerAuthorizationPath =
  "evidence/docs/0.1.0/owner-authorization.json";
export const ownerInstruction =
  "Please skip the additional chatgpt-subscription review.";
export interface OwnerAuthorization {
  authority: "repository-owner";
  decision: "publish-without-additional-model-review";
  instruction: string;
  authorizedAt: string;
  scope: string;
  previousReviewBundleHash: string;
  manualFiles: Record<string, string>;
  files: Record<string, string>;
  bundleHash: string;
}
export function ownerAuthorization() {
  return readJson(ownerAuthorizationPath) as OwnerAuthorization;
}
export function authorizationBundleHash(files: Record<string, string>) {
  return hash(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
      ),
    ),
  );
}
function validAuthority(record: OwnerAuthorization) {
  return (
    record.authority === "repository-owner" &&
    record.decision === "publish-without-additional-model-review" &&
    record.instruction === ownerInstruction
  );
}
// A scoped owner instruction may supersede an additional model review. Keep
// the prior model receipt unchanged; never label new bytes model-reviewed.
export function ownerAcceptsManualChanges(
  files: Record<string, string>,
  previousReviewBundleHash: string,
) {
  try {
    const record = ownerAuthorization();
    return (
      validAuthority(record) &&
      record.previousReviewBundleHash === previousReviewBundleHash &&
      record.bundleHash ===
        authorizationBundleHash({ ...record.manualFiles, ...record.files }) &&
      isDeepStrictEqual(record.manualFiles, files)
    );
  } catch {
    return false;
  }
}
export function stableDocumentationFiles() {
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((entry) =>
        entry.isDirectory()
          ? walk(`${dir}/${entry.name}`)
          : [`${dir}/${entry.name}`],
      );
  return [
    ...new Set([
      ...[
        "content/docs/0.1.0",
        "evidence/docs/0.1.0",
        "verification/docs/0.1.0",
        "packaging/docker/0.1.0",
        "evidence/releases/0.1.0",
      ].flatMap(walk),
      "packages/docs/versions.ts",
      "packages/docs/stable.ts",
      "packages/docs/gate.ts",
      "packages/docs/authorization.ts",
      "apps/web/components/stable-guide.tsx",
      "apps/web/components/release-badge.tsx",
      "apps/web/components/site.tsx",
      "apps/web/components/doc-version-select.tsx",
      "apps/web/components/docs-sidebar.tsx",
      "apps/web/components/docs-navigation.tsx",
      "apps/web/components/command-search.tsx",
      "packages/seo/site.ts",
      "apps/web/app/(entry)/sitemap.ts",
      "scripts/build-discovery.ts",
      "scripts/authorize-stable-docs.ts",
      "scripts/verify-stable-manual.py",
      "scripts/verify-stable-operations.py",
      "scripts/verify-stable-install.py",
      "scripts/verify-stable-monitoring.py",
      "tests/docs-versions.test.ts",
      "tests/browser/docs-versions.spec.ts",
    ]),
  ]
    .filter((file) => file !== ownerAuthorizationPath)
    .sort();
}
export function stableDocumentationHashes() {
  return Object.fromEntries(
    stableDocumentationFiles().map((file) => [file, hash(readText(file))]),
  );
}
export function ownerAuthorizationErrors() {
  try {
    const record = ownerAuthorization();
    const errors: string[] = [];
    if (!validAuthority(record))
      errors.push("Missing explicit owner review waiver");
    if (!isDeepStrictEqual(record.files, stableDocumentationHashes()))
      errors.push(
        "Stable documentation changed after owner-authorized publication was prepared",
      );
    if (
      record.bundleHash !==
      authorizationBundleHash({ ...record.manualFiles, ...record.files })
    )
      errors.push("Owner authorization manifest integrity mismatch");
    return errors;
  } catch (error) {
    return [`Invalid owner authorization: ${String(error)}`];
  }
}
