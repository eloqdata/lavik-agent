import { z } from "zod";
import { readJson } from "../content/repository";
import {
  catalogSchema,
  caseSchema,
  manualClients,
  type CommandReport,
  type ClientReport,
} from "../manual/repository";
import {
  defaultDocVersion,
  stableDocVersions,
  type StableDocVersion,
} from "./versions";
import currentRelease from "../../content/docs/0.2.0/release.json";
import currentDownloads from "../../content/docs/0.2.0/downloads.json";

export const stableRelease = currentRelease;
export const stableDownloads = currentDownloads;
export const stableReleaseFor = (
  version: StableDocVersion = defaultDocVersion,
): typeof currentRelease =>
  readJson(`content/docs/${version}/release.json`) as typeof currentRelease;
export const stableDownloadsFor = (
  version: StableDocVersion = defaultDocVersion,
): typeof currentDownloads =>
  readJson(`content/docs/${version}/downloads.json`) as typeof currentDownloads;
const text = z
  .object({ en: z.string().min(1), "zh-CN": z.string().min(1) })
  .strict();
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text }).strict(),
  z.object({ type: z.literal("list"), items: z.array(text) }).strict(),
  z.object({ type: z.literal("link"), text, href: z.string() }).strict(),
  z
    .object({
      type: z.literal("code"),
      file: z.string().regex(/^verification\/docs\/0\.[12]\.0\/[a-z0-9./-]+$/),
    })
    .strict(),
  z
    .object({
      type: z.literal("table"),
      headers: z.array(text),
      rows: z.array(z.array(text)),
    })
    .strict(),
]);
const guide = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: text,
    summary: text,
    sources: z.array(z.string()).min(1),
    sections: z
      .array(
        z
          .object({
            id: z.string(),
            title: text,
            blocks: z.array(block).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type StableGuide = z.infer<typeof guide>;
export function stableGuides(version: StableDocVersion = defaultDocVersion) {
  return z.array(guide).parse(readJson(`content/docs/${version}/guides.json`));
}
export function stableReleaseNotes(
  version: StableDocVersion = defaultDocVersion,
) {
  return guide.parse(readJson(`content/docs/${version}/release-notes.json`));
}
export function stableCatalog(version: StableDocVersion = defaultDocVersion) {
  return catalogSchema
    .extend({ commands: z.array(catalogSchema.shape.commands.element).min(1) })
    .parse(readJson(`content/docs/${version}/catalog.json`));
}
export function stableCases(version: StableDocVersion = defaultDocVersion) {
  return z
    .array(caseSchema)
    .parse(readJson(`content/docs/${version}/cases.json`));
}
export function stableCommandReport(
  version: StableDocVersion = defaultDocVersion,
) {
  return readJson(`evidence/docs/${version}/commands.json`) as CommandReport;
}
export function stableClientReport(
  version: StableDocVersion = defaultDocVersion,
) {
  return readJson(`evidence/docs/${version}/clients.json`) as ClientReport;
}
export const stableGuideRoutes = (version?: StableDocVersion): string[] =>
  (version ? [version] : stableDocVersions).flatMap((v) =>
    stableGuides(v).map((guide) => `docs/${v}/${guide.id}`),
  );
export function stablePackages(version: StableDocVersion = defaultDocVersion) {
  const stableRelease = stableReleaseFor(version),
    stableDownloads = stableDownloadsFor(version);
  if (
    stableDownloads.tag_name !== stableRelease.tag ||
    stableDownloads.prerelease
  )
    throw new Error(`Expected the stable ${stableRelease.tag} release`);
  return (["minimal", "standard"] as const).flatMap((variant) =>
    (["x86_64", "aarch64"] as const).map((arch) => {
      const filename = `lavik-${stableRelease.tag}-linux-${arch}${variant === "minimal" ? "-minimal" : ""}.tar.gz`;
      const asset = stableDownloads.assets.find((a) => a.name === filename);
      const checksum = stableDownloads.assets.find(
        (a) => a.name === `${filename}.sha256`,
      );
      const url = `https://github.com/eloqdata/lavik/releases/download/${stableRelease.tag}/${filename}`;
      if (
        !asset ||
        !checksum ||
        !/^sha256:[a-f0-9]{64}$/.test(asset.digest) ||
        asset.browser_download_url !== url ||
        checksum.browser_download_url !== `${url}.sha256`
      )
        throw new Error(`Invalid stable asset: ${filename}`);
      return {
        arch,
        variant,
        filename,
        url,
        checksumUrl: `${url}.sha256`,
        sha256: asset.digest.slice(7),
        size: asset.size,
        commands: `curl -fLO --retry 3 ${url} &&\ncurl -fLO --retry 3 ${url}.sha256 &&\nsha256sum -c ${filename}.sha256 &&\ntar -xzf ${filename}`,
      };
    }),
  );
}

export const stableManualRoutes = (version?: StableDocVersion): string[] =>
  (version ? [version] : stableDocVersions).flatMap((v) => [
    `docs/${v}/commands`,
    `docs/${v}/clients`,
    ...stableCases(v).map((c) => `docs/${v}/commands/${c.name.toLowerCase()}`),
    ...manualClients().map((c) => `docs/${v}/clients/${c.id}`),
  ]);
