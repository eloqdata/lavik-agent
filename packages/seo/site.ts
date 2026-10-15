import { faqFor } from "../editorial/faq";
import {
  benchmarkReports,
  benchmarkRoute,
  benchmarkForRoute,
} from "../benchmarks/catalog";
import { reportSourceUrl } from "../benchmarks/repository";
import { docVersionForRoute } from "../docs/versions";
import {
  stableRelease,
  stableGuides,
  stableCatalog,
  stableReleaseNotes,
} from "../docs/stable";
import { comparisonSource } from "../comparisons/measurements";
import { changedAt } from "./dates";
import {
  comparisonProducts,
  comparisonRoute,
  comparisonForRoute,
} from "../comparisons/catalog";
import { comparisonCopy, comparisonFaq } from "../comparisons/content";
import type { Metadata } from "next";
import { articles, articlePath, release } from "../content/repository";
import type { Article, Locale } from "../content/schema";
import { userGuides } from "../docs/repository";
import { operationsGuides } from "../operations/repository";
import {
  manualCatalog,
  manualClients,
  manualTitle,
} from "../manual/repository";
import { useCases } from "../use-cases/content";
import { blogTopics } from "../blog/topics";
import { blogPresentation } from "../blog/presentation";

export const siteOrigin = "https://lavik.dev";
export const canonicalRoute = (route: string) =>
  route === "docs"
    ? "docs/0.1.0"
    : route === "use-cases/datasets-beyond-memory"
      ? "use-cases/large-application-caches"
      : route.replace(/^\/+|\/+$/g, "");
const pairs: Record<string, [string, string, string, string]> = {
  "": [
    "Lavik — Faster-than-Redis SPDK throughput. NVMe SSD capacity.",
    "Lavik — SPDK 测试吞吐量超过 Redis，容量随 NVMe SSD 扩展。",
    "A Redis-compatible key-value store with values on NVMe SSD. Explore measured SPDK performance, the 20:1 capacity-price model, and Apache 2.0 source code.",
    "兼容 Redis 的键值存储，将值存于 NVMe SSD。了解实测 SPDK 性能、20:1 容量单价模型及 Apache 2.0 开源代码。",
  ],
  "faq/evaluation": [
    "Lavik FAQ: Performance, Cost and Migration",
    "Lavik 常见问题：性能、成本与迁移",
    "Answers about Lavik 0.1.0, Redis compatibility, NVMe SSD capacity costs, installation and RedisShake migration.",
    "了解 Lavik 0.1.0、Redis 兼容性、NVMe SSD 容量成本、安装与 RedisShake 迁移。",
  ],
  compare: [
    "Compare Lavik: Redis, Valkey and SSD-backed Alternatives",
    "Lavik 产品对比：Redis、Valkey 与 SSD 存储方案",
    "Compare measured Lavik NVMe SSD performance, storage architecture and cost against Redis, Valkey, DragonflyDB, Garnet, Pika, Apache Kvrocks, Tendis and KeyDB.",
    "比较 Lavik 与 Redis、Valkey、DragonflyDB、Garnet、Pika、Apache Kvrocks、Tendis、KeyDB 的实测 NVMe SSD 性能、存储架构与成本。",
  ],
  benchmarks: [
    "Lavik 0.1.0 Benchmarks: NVMe SSD Capacity, Throughput and Tail Latency",
    "Lavik 0.1.0 基准测试：NVMe SSD 容量、吞吐量与尾延迟",
    "Four published Lavik 0.1.0 studies: 2-vCPU capacity, Redis/Valkey SPDK performance, 1 TB storage peers and Aerospike YCSB. Charts, numbers and reproduction commands.",
    "四份 Lavik 0.1.0 实测报告：2 vCPU 容量、Redis/Valkey SPDK 性能、1 TB 存储对比及 Aerospike YCSB，包含图表、数值与复现命令。",
  ],
  cost: [
    "Redis Capacity Cost: DRAM vs NVMe SSD",
    "Redis 容量成本：DRAM 与 NVMe SSD",
    "Calculate Lavik capacity savings using your DRAM/NVMe SSD price ratio, index memory, and shared costs. Understand the assumptions behind 20× lower value-capacity cost.",
    "按 DRAM/NVMe SSD 单价比、索引内存和共同成本计算 Lavik 容量节省，理解值容量成本降至 1/20 的假设。",
  ],
  "use-cases": [
    "Lavik Use Cases",
    "Lavik 使用场景",
    "Evaluate Lavik for growing caches, feature serving, sessions, leaderboards, commerce, advertising, and gaming, with workload-specific requirements.",
    "针对增长中的缓存、特征服务、会话、排行榜、电商、广告和游戏，结合工作负载要求评估 Lavik。",
  ],
  blog: [
    "Lavik Engineering Blog",
    "Lavik 工程博客",
    "Explore Lavik architecture, benchmarks, use cases, best practices, and project news, with sources and version context.",
    "了解 Lavik 架构、基准测试、使用场景、最佳实践和项目动态，附资料来源和版本背景。",
  ],
  releases: [
    "Lavik Release Notes",
    "Lavik 版本说明",
    "Read Lavik release notes, download stable or archived beta packages, and review requirements and changes before upgrading.",
    "阅读 Lavik 版本说明、下载稳定版或历史 Beta 发布包，并在升级前了解要求和变更。",
  ],
  download: [
    "Download Lavik",
    "下载 Lavik",
    "Download Lavik 0.1.0-beta.1 for Linux x86-64 and ARM64: Minimal and Standard packages, SHA-256 checksums, Docker images, and installation guides.",
    "下载适用于 Linux x86-64 和 ARM64 的 Lavik 0.1.0-beta.1，查看 Minimal/Standard 发布包、SHA-256 校验和、Docker 镜像及安装指南。",
  ],
  community: [
    "Lavik Community",
    "Lavik 社区",
    "Join Lavik Community on GitHub, Discord, and Slack. Ask technical questions, report issues, and contribute to the Apache 2.0 project.",
    "加入 GitHub、Discord 和 Slack 上的 Lavik 社区，交流技术、反馈问题并参与 Apache 2.0 开源项目。",
  ],
  "docs/0.1.0": [
    "Lavik 0.1.0 Documentation",
    "Lavik 0.1.0 文档",
    "Install Lavik 0.1.0-beta.1, check Redis command and client compatibility, manage a cluster, and plan migration from Redis or Redis Cluster.",
    "安装 Lavik 0.1.0-beta.1，查看 Redis 命令和客户端兼容性、管理集群，并规划从 Redis 或 Redis Cluster 迁移。",
  ],
  "docs/0.1.0/commands": [
    "Lavik Command Reference",
    "Lavik 命令参考",
    "Browse versioned Lavik 0.1.0 command syntax, behavior, examples, and Redis compatibility limitations.",
    "查阅 Lavik 0.1.0 的命令语法、行为、示例与 Redis 兼容性限制。",
  ],
  "docs/0.1.0/clients": [
    "Lavik Client Library Compatibility",
    "Lavik 客户端兼容性",
    "Find tested Redis client libraries for Lavik 0.1.0, with exact versions, protocols, covered operations, and known limitations.",
    "查看经过测试的 Lavik 0.1.0 Redis 客户端库、具体版本、协议、覆盖操作和已知限制。",
  ],
  about: [
    "About Lavik",
    "关于 Lavik",
    "Lavik is an Apache 2.0 Redis-compatible key-value store from EloqData, using a memory index and NVMe SSD value storage. Start with Lavik 0.1.0.",
    "Lavik 是 EloqData 的 Apache 2.0 开源 Redis 兼容键值存储，使用内存索引和 NVMe SSD 值存储。开始使用 Lavik 0.1.0。",
  ],
  privacy: [
    "Website Analytics and Privacy",
    "网站统计与隐私",
    "Learn what Lavik website analytics records, how campaign attribution works, and how to opt out.",
    "了解 Lavik 网站统计记录的信息、推广来源归因方式，以及如何退出统计。",
  ],
};
export function pageInfo(locale: Locale, input: string) {
  const route = canonicalRoute(input),
    zh = locale === "zh-CN";
  const docVersion = docVersionForRoute(route);
  const stable = docVersion === "0.1.0";
  const lookupRoute = route.replace("docs/0.1.0-beta.1", "docs/0.1.0");
  const stableNote =
    route === "releases/0-1-0" ? stableReleaseNotes() : undefined;
  const archivedDownload = route === "download/0.1.0-beta.1";
  const article =
    route === "faq/evaluation"
      ? undefined
      : articles().find((a) => articlePath(a) === `/${locale}/${route}/`);
  const guide = (
    stable ? stableGuides() : [...operationsGuides, ...userGuides]
  ).find((g) => lookupRoute === `docs/0.1.0/${g.id}`);
  const useCase = useCases.find((c) => route === `use-cases/${c.slug}`);
  const topic = blogTopics.find((t) => route === `blog/topic/${t.id}`);
  const command = lookupRoute.startsWith("docs/0.1.0/commands/")
    ? (stable ? stableCatalog() : manualCatalog()).commands.find(
        (c) => c.name.toLowerCase() === route.split("/").at(-1),
      )
    : undefined;
  const client = lookupRoute.startsWith("docs/0.1.0/clients/")
    ? manualClients().find((c) => c.id === route.split("/").at(-1))
    : undefined;
  const benchmark = benchmarkForRoute(route);
  const comparison = comparisonForRoute(route);
  const fixed = pairs[archivedDownload ? "download" : lookupRoute];
  const title =
    benchmark?.title[locale] ??
    (comparison
      ? `Lavik vs ${comparison.name}: ${zh ? "性能、架构与成本" : "Performance, Architecture and Cost"}`
      : undefined) ??
    stableNote?.title[locale] ??
    article?.title ??
    guide?.title[locale] ??
    useCase?.title[locale] ??
    (topic ? `${topic.label[locale]} · Lavik Blog` : undefined) ??
    (command
      ? zh
        ? `${command.name} 命令参考`
        : `${command.name} Command Reference`
      : undefined) ??
    (client ? `${client.name} · Lavik ${client.language}` : undefined) ??
    (fixed ? fixed[zh ? 1 : 0] : manualTitle(route, locale)) ??
    "Lavik";
  const description =
    benchmark?.summary[locale] ??
    (comparison ? comparisonCopy[comparison.id].summary[locale] : undefined) ??
    stableNote?.summary[locale] ??
    article?.summary ??
    guide?.summary[locale] ??
    useCase?.summary[locale] ??
    (command
      ? `${command.summary[locale]} ${zh ? "查看 Lavik 0.1.0 的语法、示例和兼容性说明。" : "Syntax, examples, and compatibility notes for Lavik 0.1.0."}`
      : undefined) ??
    (client
      ? zh
        ? `Lavik 0.1.0 与 ${client.name} ${client.version}（${client.language}）的兼容性：${client.protocol}、测试覆盖及已知限制。`
        : `${client.name} ${client.version} (${client.language}) with Lavik 0.1.0: ${client.protocol}, tested operations, configuration, and known limitations.`
      : undefined) ??
    (topic
      ? zh
        ? `阅读 Lavik 博客的${topic.label[locale]}文章。`
        : `Explore ${topic.label.en.toLowerCase()} on the Lavik engineering blog.`
      : undefined) ??
    fixed?.[zh ? 3 : 2] ??
    (zh
      ? `${title}：Lavik 0.1.0 的版本化指南与参考。`
      : `${title}: versioned guides and reference for Lavik 0.1.0.`);
  const emptyTopic =
    !!topic &&
    !articles().some(
      (a) =>
        a.kind === "blog" &&
        a.locale === locale &&
        blogPresentation(a).topics.includes(topic.id),
    );
  return {
    route,
    title: docVersion
      ? `${title} · ${docVersion}`
      : archivedDownload
        ? `${title} · 0.1.0-beta.1`
        : title,
    description:
      stable || route === "download"
        ? description.replaceAll("0.1.0-beta.1", "0.1.0")
        : docVersion === "0.1.0-beta.1"
          ? description.replace(/0\.1\.0(?!-beta\.1)/g, "0.1.0-beta.1")
          : description,
    article,
    comparison,
    benchmark,
    emptyTopic,
    url: `${siteOrigin}/${locale}/${route ? `${route}/` : ""}`,
  };
}
export function pageMetadata(locale: Locale, route: string): Metadata {
  const p = pageInfo(locale, route),
    suffix = p.route ? `${p.route}/` : "";
  const image = `${siteOrigin}/social/${p.article?.kind === "blog" ? p.article.id : "lavik"}.png`;
  return {
    title: p.route ? p.title : { absolute: p.title },
    description: p.description,
    alternates: {
      canonical: p.url,
      languages: {
        en: `${siteOrigin}/en/${suffix}`,
        "zh-CN": `${siteOrigin}/zh-CN/${suffix}`,
        "x-default": `${siteOrigin}/en/${suffix}`,
      },
      types: { "application/rss+xml": `${siteOrigin}/${locale}/feed.xml` },
    },
    robots: p.emptyTopic
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: p.article?.kind === "blog" || p.comparison ? "article" : "website",
      siteName: "Lavik",
      title: p.title,
      description: p.description,
      url: p.url,
      locale: locale === "en" ? "en_US" : "zh_CN",
      alternateLocale: locale === "en" ? "zh_CN" : "en_US",
      images: [{ url: image, width: 1200, height: 630, alt: p.title }],
      ...(p.article?.kind === "blog"
        ? { modifiedTime: p.article.updatedAt }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      site: "@LavikCommunity",
      title: p.title,
      description: p.description,
      images: [image],
    },
  };
}
export function pageStructuredData(locale: Locale, route: string) {
  const p = pageInfo(locale, route),
    author = {
      "@type": "Organization",
      name: "Lavik project",
      url: `${siteOrigin}/${locale}/about/`,
    };
  const page: Record<string, unknown> = {
    "@type": p.article?.kind === "blog" ? "BlogPosting" : "WebPage",
    "@id": `${p.url}#page`,
    url: p.url,
    name: p.title,
    description: p.description,
    inLanguage: locale,
    isPartOf: { "@id": `${siteOrigin}/#website` },
  };
  if (p.article?.kind === "blog")
    Object.assign(page, {
      headline: p.title,
      dateModified: p.article.updatedAt,
      author,
      publisher: { "@id": `${siteOrigin}/#publisher` },
      image: `${siteOrigin}/social/${p.article.id}.png`,
      mainEntityOfPage: p.url,
      ...(p.article.publishedAt
        ? { datePublished: p.article.publishedAt }
        : {}),
    });
  if (p.comparison)
    Object.assign(page, {
      "@type": "Article",
      headline: p.title,
      author,
      publisher: { "@id": `${siteOrigin}/#publisher` },
      mainEntityOfPage: p.url,
      image: `${siteOrigin}/social/lavik.png`,
      ...(changedAt("packages/comparisons/content.ts")
        ? { dateModified: changedAt("packages/comparisons/content.ts") }
        : {}),
      citation: comparisonCopy[p.comparison.id].sources.map(
        (id) => comparisonSource(id).url,
      ),
      about: [
        { "@type": "SoftwareApplication", name: "Lavik" },
        { "@type": "SoftwareApplication", name: p.comparison.name },
      ],
    });
  if (p.benchmark)
    Object.assign(page, {
      "@type": "TechArticle",
      headline: p.title,
      author,
      publisher: { "@id": `${siteOrigin}/#publisher` },
      citation: [reportSourceUrl(p.benchmark, locale)],
      about: { "@type": "SoftwareApplication", name: "Lavik 0.1.0" },
    });
  const graph: Record<string, unknown>[] = [page];
  if (p.route === "benchmarks")
    graph.push({
      "@type": "ItemList",
      itemListElement: benchmarkReports.map((r, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: r.title[locale],
        url: `${siteOrigin}/${locale}/${benchmarkRoute(r.id)}/`,
      })),
    });
  if (p.route === "faq/evaluation")
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqFor(locale).map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  if (p.comparison)
    graph.push({
      "@type": "FAQPage",
      "@id": `${p.url}#faq`,
      inLanguage: locale,
      mainEntity: comparisonFaq(p.comparison.id, locale).map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  if (p.route === "compare")
    graph.push({
      "@type": "ItemList",
      itemListElement: comparisonProducts.map((product, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `Lavik vs ${product.name}`,
        url: `${siteOrigin}/${locale}/${comparisonRoute(product.id)}/`,
      })),
    });
  if (!p.route || p.route === "about")
    graph.push({
      "@type": "SoftwareSourceCode",
      "@id": `${siteOrigin}/#lavik`,
      name: "Lavik",
      description:
        "An Apache 2.0 Redis-compatible key-value store with an in-memory key index and NVMe SSD value storage.",
      codeRepository: "https://github.com/eloqdata/lavik",
      license: "https://github.com/eloqdata/lavik/blob/main/LICENSE",
      version: stableRelease.version,
      runtimePlatform: "Linux",
      url: `${siteOrigin}/${locale}/about/`,
    });
  if (p.route)
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Lavik",
          item: `${siteOrigin}/${locale}/`,
        },
        ...(p.comparison || p.benchmark
          ? [
              {
                "@type": "ListItem",
                position: 2,
                name: p.benchmark
                  ? locale === "en"
                    ? "Benchmarks"
                    : "基准测试"
                  : locale === "en"
                    ? "Compare"
                    : "产品对比",
                item: `${siteOrigin}/${locale}/${p.benchmark ? "benchmarks" : "compare"}/`,
              },
            ]
          : []),
        {
          "@type": "ListItem",
          position: p.comparison || p.benchmark ? 3 : 2,
          name: p.title,
          item: p.url,
        },
      ],
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteOrigin}/#publisher`,
      name: "EloqData",
      url: "https://github.com/eloqdata",
    },
    {
      "@type": "WebSite",
      "@id": `${siteOrigin}/#website`,
      name: "Lavik",
      url: siteOrigin,
      inLanguage: ["en", "zh-CN"],
      publisher: { "@id": `${siteOrigin}/#publisher` },
    },
  ],
};
