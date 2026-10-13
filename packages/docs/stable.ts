import { z } from "zod";
import { readJson } from "../content/repository";
import {
  catalogSchema,
  caseSchema,
  manualClients,
  type CommandReport,
  type ClientReport,
} from "../manual/repository";
import stableRelease from "../../content/docs/0.1.0/release.json";
import stableDownloads from "../../content/docs/0.1.0/downloads.json";

export { stableRelease, stableDownloads };
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
      file: z.string().regex(/^verification\/docs\/0\.1\.0\/[a-z0-9./-]+$/),
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
export function stableGuides() {
  return z.array(guide).parse(readJson("content/docs/0.1.0/guides.json"));
}
export function stableReleaseNotes() {
  return guide.parse(readJson("content/docs/0.1.0/release-notes.json"));
}
export function stableCatalog() {
  return catalogSchema
    .extend({ commands: z.array(catalogSchema.shape.commands.element).min(1) })
    .parse(readJson("content/docs/0.1.0/catalog.json"));
}
export function stableCases() {
  return z.array(caseSchema).parse(readJson("content/docs/0.1.0/cases.json"));
}
export function stableCommandReport() {
  return readJson("evidence/docs/0.1.0/commands.json") as CommandReport;
}
export function stableClientReport() {
  return readJson("evidence/docs/0.1.0/clients.json") as ClientReport;
}
export const stableGuideRoutes = () =>
  stableGuides().map((guide) => `docs/0.1.0/${guide.id}`);
export function stablePackages() {
  if (
    stableDownloads.tag_name !== stableRelease.tag ||
    stableDownloads.prerelease
  )
    throw new Error("Expected the stable v0.1.0 release");
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

export const stableManualRoutes = () => [
  "docs/0.1.0/commands",
  "docs/0.1.0/clients",
  ...stableCases().map((c) => `docs/0.1.0/commands/${c.name.toLowerCase()}`),
  ...manualClients().map((c) => `docs/0.1.0/clients/${c.id}`),
];
