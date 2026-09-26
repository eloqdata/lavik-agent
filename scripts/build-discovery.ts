import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  articles,
  articlePath,
  release,
  sourceText,
} from "../packages/content/repository.ts";
import { blogPresentation } from "../packages/blog/presentation.ts";
import { blogCoverSvg } from "../packages/blog/cover.ts";
import {
  campaignSources,
  campaignUrl,
} from "../packages/marketing/attribution.ts";

const out = path.resolve("apps/web/out");
await fs.mkdir(path.join(out, "benchmarks"), { recursive: true });
await fs.writeFile(
  path.join(out, "benchmarks/spdk-2026-09-18.csv"),
  sourceText("benchmark-spdk-data"),
);
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
const pages = articles();
const blog = pages.filter((a) => a.kind === "blog");
await fs.mkdir(path.join(out, "social"), { recursive: true });
for (const item of [
  {
    id: "lavik",
    title: "Redis-compatible. Capacity on NVMe SSD.",
    motif: "index" as const,
  },
  ...blog
    .filter((a) => a.locale === "en")
    .map((a) => ({
      id: a.id,
      title: a.title,
      motif: blogPresentation(a).motif,
    })),
]) {
  let svg = blogCoverSvg(item.id, item.motif);
  const base = svg.match(/--base:([^;]+);/)![1],
    light = svg.match(/--light:([^";]+)/)![1];
  svg = svg.replaceAll("var(--base)", base).replaceAll("var(--light)", light);
  const words = item.title.split(" "),
    lines: string[] = [];
  for (const word of words) {
    if (!lines.length || lines.at(-1)!.length + word.length > 58)
      lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const footer = `<svg width="1200" height="180"><rect width="1200" height="180" fill="#f4f0e8"/><text x="46" y="40" font-family="sans-serif" font-size="22" fill="#39342e">LAVIK · ENGINEERING</text>${lines
    .slice(0, 3)
    .map(
      (line, i) =>
        `<text x="46" y="${85 + i * 36}" font-family="sans-serif" font-weight="600" font-size="30" fill="#211e19">${xml(line)}</text>`,
    )
    .join("")}</svg>`;
  await sharp(Buffer.from(svg))
    .extend({ bottom: 180, background: "#f4f0e8" })
    .composite([{ input: Buffer.from(footer), top: 450, left: 0 }])
    .png()
    .toFile(path.join(out, "social", `${item.id}.png`));
}
for (const locale of ["en", "zh-CN"] as const) {
  const entries = pages
    .filter((a) => a.locale === locale && ["blog", "release"].includes(a.kind))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Lavik ${locale === "en" ? "Blog and Releases" : "博客与版本发布"}</title><link>https://lavik.dev/${locale}/blog/</link><description>Lavik architecture, benchmarks, and release news.</description><language>${locale}</language><atom:link href="https://lavik.dev/${locale}/feed.xml" rel="self" type="application/rss+xml"/>${entries.map((a) => `<item><title>${xml(a.title)}</title><link>https://lavik.dev${articlePath(a)}</link><guid isPermaLink="true">https://lavik.dev${articlePath(a)}</guid><description>${xml(a.summary)}</description>${a.publishedAt ? `<pubDate>${new Date(`${a.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>` : ""}</item>`).join("")}</channel></rss>`;
  await fs.writeFile(path.join(out, locale, "feed.xml"), rss);
}
const llms = `# Lavik\n\n> Lavik is an Apache 2.0 Redis-compatible key-value store with a DRAM key index and NVMe SSD value storage.\n\nCurrent release: ${release.tag}. Documentation version: ${release.version}. Linux x86-64 and ARM64. Verify command and client compatibility for this version.\n\nThe published SPDK experiment records higher peak GET/SET throughput than its Redis and Valkey controls. A 20:1 DRAM/NVMe SSD unit-capacity price ratio gives 20× lower value-capacity cost; memory, replication, server costs, and workload SLA need separate evaluation. Cite the methodology and assumptions with these claims.\n\n## Start here\n\n- [About Lavik](https://lavik.dev/en/about/): Project identity and evaluation path.\n- [Documentation](https://lavik.dev/en/docs/0.1.0/): Versioned installation, operations, and migration guides.\n- [Download](https://lavik.dev/en/download/): Packages, checksums, and requirements.\n- [Command reference](https://lavik.dev/en/docs/0.1.0/commands/): Syntax and behavior.\n- [Client compatibility](https://lavik.dev/en/docs/0.1.0/clients/): Tested library versions and limitations.\n- [Benchmarks](https://lavik.dev/en/benchmarks/): Current measurements and methodology.\n- [Capacity cost](https://lavik.dev/en/cost/): Explicit assumptions and calculator.\n- [Use cases](https://lavik.dev/en/use-cases/): Workload-specific evaluations.\n- [Release notes](https://lavik.dev/en/releases/): Version history.\n- [中文文档](https://lavik.dev/zh-CN/docs/0.1.0/): 中文用户手册。\n- [Source repository](https://github.com/eloqdata/lavik): Upstream code, issues, and license.\n\n## Engineering articles\n\n${blog
  .filter((a) => a.locale === "en")
  .map(
    (a) => `- [${a.title}](https://lavik.dev${articlePath(a)}): ${a.summary}`,
  )
  .join(
    "\n",
  )}\n\n## Feeds\n\n- [English blog and releases](https://lavik.dev/en/feed.xml)\n- [中文博客与版本发布](https://lavik.dev/zh-CN/feed.xml)\n\nHistorical articles retain their original measurements and source snapshots. Use the current benchmark page for the latest published comparison.\n`;
await fs.writeFile(path.join(out, "llms.txt"), llms);
await fs.writeFile(
  path.join(out, "campaign-links.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      articles: blog.map((a) => ({
        id: a.id,
        locale: a.locale,
        canonical: `https://lavik.dev${articlePath(a)}`,
        links: Object.fromEntries(
          campaignSources.map((source) => [
            source,
            campaignUrl(
              articlePath(a),
              source,
              a.id,
              blog.map((item) => item.id),
            ),
          ]),
        ),
      })),
    },
    null,
    2,
  ) + "\n",
);
const discovery = JSON.parse(
  await fs.readFile("content/discovery.json", "utf8"),
);
await fs.writeFile(
  path.join(out, `${discovery.indexNowKey}.txt`),
  discovery.indexNowKey + "\n",
);
console.log(
  `Discovery assets: llms.txt, 2 feeds, ${1 + blog.length / 2} social images, and campaign links.`,
);
