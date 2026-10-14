import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { benchmarkReports, type BenchmarkReport } from "./catalog";
import type { Locale } from "../content/schema";
export const benchmarkRoot = "evidence/benchmarks/0.1.0";
export const benchmarkSources = JSON.parse(
  fs.readFileSync(benchmarkRoot + "/sources.json", "utf8"),
) as {
  commit: string;
  fetchedAt: string;
  files: {
    path: string;
    upstreamPath: string;
    sha256: string;
    bytes: number;
    url: string;
  }[];
};
export const digest = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function sourceFile(report: BenchmarkReport, file: string) {
  const entry = benchmarkSources.files.find(
    (s) => s.path === benchmarkRoot + "/" + report.directory + "/" + file,
  );
  if (!entry) throw new Error("Unknown benchmark artifact");
  const data = fs.readFileSync(entry.path);
  if (digest(data) !== entry.sha256 || data.length !== entry.bytes)
    throw new Error("Benchmark source changed: " + entry.path);
  return { entry, data };
}
export const reportSourceUrl = (r: BenchmarkReport, locale: Locale = "en") =>
  sourceFile(r, locale === "en" ? "README.md" : "README.zh-CN.md").entry.url;
export const assetUrl = (r: BenchmarkReport, file: string) =>
  "/benchmark-assets/0.1.0/" + r.id + "/" + file;
export function reportMarkdown(r: BenchmarkReport, locale: Locale) {
  const original = sourceFile(
    r,
    locale === "en" ? "README.md" : "README.zh-CN.md",
  ).data.toString();
  return original
    .split("\n")
    .slice(3)
    .join("\n")
    .trim()
    .replace(
      /^<img src="([^"]+)" alt="([^"]*)" width="\d+">\s*$/gm,
      (_, src, alt) => "![" + alt + "](" + src + ")",
    );
}
export function reportLink(r: BenchmarkReport, url: string, locale: Locale) {
  if (!url) return "";
  if (url.startsWith("#")) return url;
  if (/^https?:\/\//.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) return "";
  if (url === "README.md" || url === "README.zh-CN.md")
    return (
      "/" + (url === "README.md" ? "en" : "zh-CN") + "/benchmarks/" + r.id + "/"
    );
  if (
    benchmarkSources.files.some(
      (s) => s.path === benchmarkRoot + "/" + r.directory + "/" + url,
    )
  )
    return assetUrl(r, url);
  return new URL(url, reportSourceUrl(r, locale)).href;
}
export const headingId = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
export function reportSections(r: BenchmarkReport, locale: Locale) {
  let fenced = false;
  return reportMarkdown(r, locale)
    .split("\n")
    .flatMap((line) => {
      if (
        line.startsWith("~~~") ||
        line.startsWith(String.fromCharCode(96).repeat(3))
      )
        fenced = !fenced;
      if (fenced || !line.startsWith("## ")) return [];
      const text = line.slice(3).replace(/[*_\x60]/g, "");
      return [{ text, id: headingId(text) }];
    });
}
export function reportAssets() {
  return benchmarkReports.flatMap((report) =>
    benchmarkSources.files
      .filter(
        (s) => path.dirname(s.path) === benchmarkRoot + "/" + report.directory,
      )
      .map((s) => ({ report: report.id, file: path.basename(s.path) })),
  );
}
