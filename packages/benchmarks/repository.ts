import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { benchmarkReports, type BenchmarkReport } from "./catalog";
import type { Locale } from "../content/schema";
export const benchmarkRoot = "evidence/benchmarks/0.2.0";
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
  "/benchmark-assets/0.2.0/" + r.id + "/" + file;
// The upstream memory report contains two independent server configurations.
// Keep its pinned bytes intact and select the matching view for each topic.
function scopedMemoryReport(
  r: BenchmarkReport,
  original: string,
  locale: Locale,
) {
  const cpu =
    r.id === "2vcpu-capacity"
      ? "2"
      : r.id === "redis-valkey"
        ? "16"
        : undefined;
  if (!cpu) return original;
  const lines = original.split("\n");
  const firstSection = lines.findIndex((line) => line.startsWith("## "));
  if (firstSection < 0) throw new Error("Missing memory report sections");
  const rows = lines
    .slice(0, firstSection)
    .filter((line) => /^\| (?:2|16) \|/.test(line));
  const selected = rows.filter((line) => line.startsWith(`| ${cpu} |`));
  if (selected.length !== (cpu === "2" ? 1 : 2))
    throw new Error("Memory report workload matrix changed");
  const points = selected.reduce(
    (sum, row) => sum + Number(row.split("|").at(-2)!.trim()),
    0,
  );
  const intro = lines
    .slice(0, firstSection)
    .filter(
      (line) =>
        !line.trim() ||
        line.startsWith("| Server vCPUs |") ||
        line.startsWith("| ---") ||
        selected.includes(line) ||
        line.startsWith("["),
    );
  let section = true,
    subsection = true,
    fence = "";
  const body: string[] = [];
  for (const line of lines.slice(firstSection)) {
    const marker = line.match(/^(`{3,}|~{3,})/);
    if (!fence) {
      if (line.startsWith("## ")) {
        const scope = line.match(/^## (2|16) vCPUs?\b/);
        section = !scope || scope[1] === cpu;
        subsection = true;
      } else if (line.startsWith("### ")) {
        const scope = line.match(/^### (2|16) vCPUs?\b/);
        if (scope) subsection = scope[1] === cpu;
      }
    }
    if (section && subsection) {
      if (
        line.startsWith("Raw evidence is namespaced by") ||
        line.startsWith("原始证据按")
      ) {
        const namespaces =
          cpu === "2" ? "`2vcpu`" : "`16vcpu-10m`, `16vcpu-1b`";
        body.push(
          locale === "en"
            ? `This view uses the ${namespaces} evidence namespace(s). The archive includes a per-file SHA-256 manifest; CSV suite and source fields identify each measurement.`
            : `本页使用 ${namespaces} 证据目录。归档包含逐文件 SHA-256 清单；CSV 中的 suite 和 source 字段可定位对应测量。`,
        );
      } else body.push(line);
    }
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
        fence = "";
    }
  }
  return [
    r.summary[locale],
    "",
    locale === "en"
      ? `This ${cpu}-vCPU view contains **${points} formal points**, with **1 KiB values**, measured on **${r.date} (UTC)**.`
      : `本页仅展示 **${cpu} vCPU** 服务端的 **${points} 个正式测量点**，value 为 **1 KiB**，测试日期为 **${r.date}（UTC）**。`,
    "",
    ...intro,
    "",
    ...body,
  ].join("\n");
}
export function reportMarkdown(r: BenchmarkReport, locale: Locale) {
  const original = sourceFile(
    r,
    locale === "en" ? "README.md" : "README.zh-CN.md",
  ).data.toString();
  const body = original.split("\n").slice(3).join("\n").trim();
  return scopedMemoryReport(r, body, locale).replace(
    /^<img src="([^"]+)" alt="([^"]*)" width="\d+">\s*$/gm,
    (_, src, alt) => "![" + alt + "](" + src + ")",
  );
}
export function reportAssetData(r: BenchmarkReport, file: string) {
  const source = sourceFile(r, file).data;
  if (
    (r.id === "2vcpu-capacity" || r.id === "redis-valkey") &&
    (file === "README.md" || file === "README.zh-CN.md")
  ) {
    const locale = file === "README.md" ? "en" : "zh-CN";
    return Buffer.from(
      `# ${r.title[locale]}\n\n${reportMarkdown(r, locale)}\n`,
    );
  }
  return source;
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
