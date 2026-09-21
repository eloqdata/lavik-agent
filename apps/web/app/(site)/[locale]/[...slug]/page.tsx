import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  articles,
  articlePath,
  contentHash,
  claims,
  release,
  sources,
} from "../../../../../../packages/content/repository";
import { localeSchema } from "../../../../../../packages/content/schema";
import {
  benchmarkRows,
  currentBenchmark,
} from "../../../../../../packages/content/benchmarks";
import { ArticleBody } from "../../../../components/content";
import { ArticleBody as VerifiedArticleBody } from "../../../../components/content-v2";
import {
  articleReview,
  articleReceipts,
} from "../../../../../../packages/content/gate";
import { BenchmarkChart } from "../../../../components/benchmark";
import { CostCalculator } from "../../../../components/cost-calculator";
import { ManualPage } from "../../../../components/manual";
import {
  manualRoutes,
  manualTitle,
} from "../../../../../../packages/manual/repository";

import { DownloadPage } from "../../../../components/download-page";
import { CommunityPage } from "../../../../components/community-page";
import { DocsHome } from "../../../../components/docs-home";
import { DocsSidebar } from "../../../../components/docs-sidebar";
import { UseCasePage, UseCasesHome } from "../../../../components/use-cases";
import { useCases } from "../../../../../../packages/use-cases/content";

const indexRoutes = [
  "benchmarks",
  "cost",
  "use-cases",
  "blog",
  "releases",
  "download",
  "community",
  "docs",
  "docs/0.1.0",
];
export const dynamicParams = false;
export function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return [
    ...articles()
      .filter((a) => a.locale === params.locale)
      .map((a) => ({
        slug: articlePath(a).split("/").filter(Boolean).slice(1),
      })),
    ...indexRoutes.map((route) => ({ slug: route.split("/") })),
    ...manualRoutes().map((route) => ({ slug: route.split("/") })),
    ...useCases.map((entry) => ({ slug: ["use-cases", entry.slug] })),
  ];
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const useCase =
    slug[0] === "use-cases"
      ? useCases.find((entry) => entry.slug === slug[1])
      : undefined;
  const parsedLocale = localeSchema.parse(locale);
  const article = articles().find(
    (a) => articlePath(a) === `/${locale}/${slug.join("/")}/`,
  );
  const titles: Record<string, string[]> = {
    benchmarks: ["Benchmarks", "基准测试"],
    cost: ["Capacity economics", "容量经济性"],
    "use-cases": ["Use cases", "使用场景"],
    blog: ["Blog", "博客"],
    download: ["Download", "下载"],
    community: ["Community", "社区"],
    docs: ["Documentation", "文档"],
    releases: ["Releases", "版本说明"],
  };
  return {
    title:
      useCase?.title[parsedLocale] ??
      article?.title ??
      manualTitle(slug.join("/"), localeSchema.parse(locale)) ??
      titles[slug[0]]?.[locale === "en" ? 0 : 1],
    description:
      useCase?.summary[parsedLocale] ??
      article?.summary ??
      (slug[0] === "download"
        ? locale === "en"
          ? "Download Lavik 0.1.0 beta for Linux x86-64 and ARM64. Standard and Minimal packages, requirements, and SHA-256 checksums."
          : "下载适用于 Linux x86-64 和 ARM64 的 Lavik 0.1.0 beta，查看 Standard / Minimal 发布包、系统要求和 SHA-256 校验和。"
        : slug[0] === "community"
          ? locale === "en"
            ? "Join Lavik Community on Slack, Discord, and GitHub. Get involved in an Apache 2.0 open-source key-value store."
            : "加入 Slack、Discord 和 GitHub 上的 Lavik Community，一起构建 Apache 2.0 开源键值存储。"
          : undefined),
    alternates: {
      canonical: `/${locale}/${slug.join("/") === "docs" ? "docs/0.1.0" : slug.join("/")}/`,
      languages: {
        en: `/en/${slug.join("/")}/`,
        "zh-CN": `/zh-CN/${slug.join("/")}/`,
      },
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const resolved = await params,
    locale = localeSchema.parse(resolved.locale),
    zh = locale === "zh-CN";
  const route = resolved.slug.join("/");
  if (route === "use-cases") return <UseCasesHome locale={locale} />;
  const useCase = useCases.find((entry) => route === `use-cases/${entry.slug}`);
  if (useCase) return <UseCasePage locale={locale} entry={useCase} />;
  if (route === "download") return <DownloadPage locale={locale} />;
  if (route === "community") return <CommunityPage locale={locale} />;
  if (route === "docs" || route === "docs/0.1.0")
    return <DocsHome locale={locale} />;
  if (manualTitle(route, locale))
    return <ManualPage route={route} locale={locale} />;
  const pages = articles().filter((a) => a.locale === locale);
  const article = pages.find((a) => articlePath(a) === `/${locale}/${route}/`);
  if (article)
    return (
      <main
        id="main"
        className="container document-layout"
        data-content-hash={contentHash(article)}
      >
        <DocsSidebar locale={locale} route={route} />
        <article className="document">
          <div className="breadcrumb">
            <Link href={`/${locale}/`}>Lavik</Link>
            <span>/</span>
            <span>{article.kind === "docs" ? "0.1.0" : article.kind}</span>
          </div>
          <h1>{article.title}</h1>
          <p className="document-summary">{article.summary}</p>
          <div className="article-meta">
            {zh ? "文档版本" : "Documentation"}: 0.1.0 · {release.tag} ·{" "}
            {article.updatedAt}
          </div>
          {article.kind === "release" || article.id === "quick-start" ? (
            <div className="download-box">
              <a
                href={`https://github.com/eloqdata/lavik/releases/tag/${release.tag}`}
              >
                {zh ? "查看发布包与校验和" : "Release packages & checksums"} ↗
              </a>
              <p>
                {zh ? "当前固定版本" : "Pinned release"}: {release.tag}
              </p>
            </div>
          ) : null}
          {articleReview(article).rendererVersion === 2 ? (
            <VerifiedArticleBody
              article={article}
              receipts={articleReceipts(article)}
            />
          ) : (
            <ArticleBody article={article} />
          )}
        </article>
      </main>
    );
  if (route === "benchmarks")
    return (
      <main id="main" className="container wide-page">
        <p className="eyebrow">
          {zh ? "可核查的性能" : "Performance, in context"}
        </p>
        <h1>
          {zh
            ? "接近内存的性能，\n附上完整测试条件。"
            : "Near in-memory performance.\nWith the conditions attached."}
        </h1>
        <p className="page-lead">
          {zh
            ? `以下结果来自 ${currentBenchmark.date} 的 SPDK 报告。Lavik 使用下载的 ${currentBenchmark.release} 标准发布包；Redis 和 Valkey 对照数据复用同一组主机上的较早测试。`
            : `Results from the ${currentBenchmark.date} SPDK report. Lavik uses the downloaded ${currentBenchmark.release} standard package; Redis and Valkey controls reuse an earlier sweep on the same hosts.`}
        </p>
        <BenchmarkChart rows={benchmarkRows()} locale={locale} />
        <div className="prose">
          <h2>{zh ? "实验环境" : "The experiment"}</h2>
          <p>{currentBenchmark.scope[locale]}</p>
          <p>
            {zh
              ? "测试扫描了 80–1,280 个连接。Lavik 的 GET 峰值对应 640 个连接，SET 峰值对应 1,280 个连接；Redis 和 Valkey 的峰值均对应 1,280 个连接。Redis 使用 16 个 I/O 线程；Valkey 的 GET 使用 16 个线程，SET 使用 8 个线程；Lavik 使用 16 个工作线程。p99 对应各系统所选的吞吐量峰值。"
              : "The sweep covers 80–1,280 connections. Lavik peaks at 640 connections for GET and 1,280 for SET; Redis and Valkey peak at 1,280. Redis uses 16 I/O threads; Valkey uses 16 for GET and 8 for SET; Lavik uses 16 workers. Each p99 corresponds to the selected throughput peak."}
          </p>
          <p>
            {zh ? "Lavik 测试提交" : "Tested Lavik commit"}:{" "}
            <code>{currentBenchmark.commit}</code>
          </p>
          <a
            className="text-link"
            href={sources.find((s) => s.id === currentBenchmark.sourceId)!.url}
          >
            {zh ? "阅读完整报告与限制" : "Read the full report and limitations"}{" "}
            ↗
          </a>
        </div>
      </main>
    );
  if (route === "cost")
    return (
      <main id="main" className="container wide-page">
        <p className="eyebrow">
          {zh ? "从性能结果推导经济性" : "From performance to economics"}
        </p>
        <h1>
          {zh
            ? "容量换一种方式，\n成本也换一种结构。"
            : "A different capacity tier.\nA different cost equation."}
        </h1>
        <p className="page-lead">
          {zh
            ? "NVMe SSD 上接近内存的实测性能，为降低容量成本提供了依据。节约多少，可以根据明确的假设计算。"
            : "Measured near-memory performance on NVMe SSD makes a lower-cost capacity tier worth evaluating. The saving can be calculated from explicit assumptions."}
        </p>
        <div className="prose">
          <h2>
            {zh
              ? "20:1 的容量单价比意味着什么？"
              : "What does a 20:1 capacity-price ratio mean?"}
          </h2>
          <p>
            {zh
              ? "如果 DRAM 每 GiB 的价格是 SSD 的 20 倍，同样大小的值数据放在 SSD 上，其存储介质成本为 DRAM 的 1/20，即降低 95%。这是在给定单价比下的算术推导，不是某项硬件报价，也不是完整部署的实测节约率。"
              : "If DRAM costs 20 times as much per GiB as SSD, placing the same value payload on SSD costs one twentieth as much for that storage component: 95% less. This is arithmetic under a stated price assumption, not a hardware quotation or a measured whole-deployment saving."}
          </p>
          <p>
            {zh
              ? "Lavik 仍需要内存保存索引和运行时状态。CPU、副本、可用容量和运维成本也要纳入完整对比。下方模型展示这些因素如何改变总体比值。"
              : "Lavik still needs memory for indexes and runtime state. CPU, replicas, usable capacity, and operations also enter a complete comparison. The model below shows how those factors affect the overall ratio."}
          </p>
        </div>
        <CostCalculator locale={locale} />
        <div className="prose">
          <h2>
            {zh
              ? "报告中已有的实例价格对比"
              : "An instance-price comparison already in the reports"}
          </h2>
          <p>
            {zh
              ? "2026 年 8 月 12 日提供的月费估算为：Azure Managed Redis Flex（480 GB / 16 vCPU）$2,414.28，Lavik Standard_L16s_v3 服务器 $1,152.67。计算结果为 2.09 倍的价格比，Lavik 实例月费约低 52.3%。这不是对内存 Redis 的同 SLA 总成本测试：托管服务与自管虚拟机的服务边界、数据集和测试窗口不同。"
              : "The estimates supplied on August 12, 2026 were $2,414.28/month for Azure Managed Redis Flex (480 GB / 16 vCPU) and $1,152.67/month for the Lavik Standard_L16s_v3 server. That is a 2.09× price ratio, or approximately 52.3% lower Lavik instance cost. This is not an equal-SLA total-cost test against in-memory Redis: the managed service and self-managed VM have different service boundaries, datasets, and test windows."}
          </p>
          <a
            className="text-link"
            href={sources.find((s) => s.id === "tiering-cost")!.url}
          >
            {zh
              ? "查看原始成本估算与实验配置"
              : "Inspect the original estimates and configuration"}{" "}
            ↗
          </a>
        </div>
      </main>
    );
  const kinds = {
    "use-cases": "use-case",
    blog: "blog",
    releases: "release",
  } as const;
  const kind = kinds[route as keyof typeof kinds];
  if (!kind) notFound();
  const titles = {
    "use-case": zh ? "从你的应用出发。" : "Start with your application.",
    blog: zh ? "Lavik 博客" : "Lavik Blog",
    release: zh ? "每个版本，都有依据。" : "Every version, accounted for.",
  };
  return (
    <main id="main" className="container wide-page">
      <p className="eyebrow">LAVIK / {route}</p>
      <h1>{titles[kind]}</h1>
      <p className="page-lead">
        {kind === "use-case"
          ? zh
            ? "基于产品架构的评估场景。"
            : "Evaluation scenarios grounded in the product architecture."
          : zh
            ? "带着上下文，理解每一次变化。"
            : "Understand the details, with their context."}
      </p>
      <div className="article-list">
        {pages
          .filter((a) => a.kind === kind)
          .map((a) => (
            <Link
              href={articlePath(a)}
              className="article-list-item"
              key={a.id}
            >
              <time>{a.updatedAt}</time>
              <div>
                <h2>{a.title}</h2>
                <p>{a.summary}</p>
              </div>
              <span>↗</span>
            </Link>
          ))}
      </div>
    </main>
  );
}
