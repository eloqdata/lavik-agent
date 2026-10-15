import { TechnicalArticleBody } from "../../../../components/technical-article";
import { AdoptionFaq } from "../../../../components/adoption-faq";
import {
  docVersionForRoute,
  isDocVersion,
} from "../../../../../../packages/docs/versions";
import {
  stableGuideRoutes,
  stableGuides,
  stableReleaseNotes,
  stableManualRoutes,
} from "../../../../../../packages/docs/stable";
import { StableGuidePage } from "../../../../components/stable-guide";
import {
  pageMetadata,
  pageStructuredData,
} from "../../../../../../packages/seo/site";
import { StructuredData } from "../../../../components/structured-data";
import { ProjectPage } from "../../../../components/project-page";
import {
  userGuides,
  userGuideRoutes,
} from "../../../../../../packages/docs/repository";
import { UserGuidePage } from "../../../../components/user-guide";
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
import { ArticleBody } from "../../../../components/content";
import { ArticleBody as VerifiedArticleBody } from "../../../../components/content-v2";
import {
  articleReview,
  articleReceipts,
  publicationErrors,
} from "../../../../../../packages/content/gate";
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
import { QuickStartSetup } from "../../../../components/quick-start";
import { OperationsPage } from "../../../../components/operations";
import {
  operationsGuides,
  operationsRoutes,
} from "../../../../../../packages/operations/repository";
import { blogTopics } from "../../../../../../packages/blog/topics";
import {
  BlogIndex,
  BlogSidebar,
  BlogCover,
  BlogTopicLinks,
} from "../../../../components/blog";

const indexRoutes = [
  "cost",
  "use-cases",
  "blog",
  "releases",
  "download",
  "community",
  "docs",
  "docs/0.1.0",
  "docs/0.1.0-beta.1",
  "download/0.1.0-beta.1",
  "releases/0-1-0",
  "about",
  "privacy",
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
    ...stableGuideRoutes().map((route) => ({ slug: route.split("/") })),
    ...stableManualRoutes().map((route) => ({ slug: route.split("/") })),
    ...manualRoutes().map((route) => ({ slug: route.split("/") })),
    ...userGuideRoutes().map((route) => ({ slug: route.split("/") })),
    ...operationsRoutes().map((route) => ({ slug: route.split("/") })),
    ...useCases.map((entry) => ({ slug: ["use-cases", entry.slug] })),
    ...blogTopics.map((entry) => ({ slug: ["blog", "topic", entry.id] })),
  ];
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  return pageMetadata(localeSchema.parse(locale), slug.join("/"));
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const { locale, slug } = await params;
  return (
    <>
      <StructuredData
        data={pageStructuredData(localeSchema.parse(locale), slug.join("/"))}
      />
      <PageContent params={params} />
    </>
  );
}
async function PageContent({
  params,
}: {
  params: Promise<{ locale: string; slug: string[] }>;
}) {
  const resolved = await params,
    locale = localeSchema.parse(resolved.locale),
    zh = locale === "zh-CN";
  const route = resolved.slug.join("/");
  if (route === "about" || route === "privacy")
    return <ProjectPage locale={locale} kind={route} />;
  if (route === "faq/evaluation") return <AdoptionFaq locale={locale} />;
  if (route === "use-cases/datasets-beyond-memory")
    return (
      <UseCasePage
        locale={locale}
        entry={useCases.find((c) => c.slug === "large-application-caches")!}
      />
    );
  if (route === "use-cases") return <UseCasesHome locale={locale} />;
  const useCase = useCases.find((entry) => route === `use-cases/${entry.slug}`);
  if (useCase) return <UseCasePage locale={locale} entry={useCase} />;
  if (route === "download") return <DownloadPage locale={locale} />;
  if (route.startsWith("download/") && isDocVersion(route.slice(9)))
    return (
      <DownloadPage
        locale={locale}
        version={route.slice(9) as "0.1.0-beta.1"}
      />
    );
  if (route === "releases/0-1-0")
    return (
      <StableGuidePage
        locale={locale}
        guide={stableReleaseNotes()}
        releaseNote
      />
    );
  if (route === "community") return <CommunityPage locale={locale} />;
  const docVersion = docVersionForRoute(route);
  if (docVersion && (route === "docs" || route.split("/").length === 2))
    return <DocsHome locale={locale} version={docVersion} />;
  if (docVersion === "0.1.0") {
    const stableGuide = stableGuides().find(
      (guide) => route === `docs/0.1.0/${guide.id}`,
    );
    if (stableGuide)
      return <StableGuidePage locale={locale} guide={stableGuide} />;
    if (
      manualTitle(route, locale) ||
      route === "docs/0.1.0/commands/lavik.replicaof"
    )
      return <ManualPage route={route} locale={locale} version="0.1.0" />;
    notFound();
  }
  const operatorGuide = [...operationsGuides, ...userGuides].find(
    (g) => route === `docs/0.1.0-beta.1/${g.id}`,
  );
  if (operatorGuide) {
    const userGuide = userGuides.find((g) => g.id === operatorGuide.id);
    if (userGuide) return <UserGuidePage locale={locale} guide={userGuide} />;
    return (
      <OperationsPage
        locale={locale}
        guide={operationsGuides.find((g) => g.id === operatorGuide.id)!}
      />
    );
  }
  if (manualTitle(route, locale))
    return <ManualPage route={route} locale={locale} />;
  const pages = articles().filter((a) => a.locale === locale);
  if (route === "blog") return <BlogIndex locale={locale} posts={pages} />;
  const topic = blogTopics.find((entry) => route === `blog/topic/${entry.id}`);
  if (topic)
    return <BlogIndex locale={locale} posts={pages} topic={topic.id} />;
  const article = pages.find((a) => articlePath(a) === `/${locale}/${route}/`);
  if (article) {
    const errors = publicationErrors(article);
    if (errors.length)
      throw new Error(
        `Article cannot be exported: ${article.id}: ${errors.join("; ")}`,
      );
    return (
      <main
        id="main"
        className={`container document-layout${article.kind === "blog" ? " blog-detail" : ""}`}
        data-content-hash={contentHash(article)}
      >
        {article.kind === "blog" ? (
          <BlogSidebar
            locale={locale}
            posts={pages}
            activeArticle={article.id}
          />
        ) : (
          <DocsSidebar locale={locale} route={route} />
        )}
        <article className="document">
          <div className="breadcrumb">
            <Link href={`/${locale}/`}>Lavik</Link>
            <span>/</span>
            <span>
              {article.kind === "docs" ? "0.1.0-beta.1" : article.kind}
            </span>
          </div>
          <h1>{article.title}</h1>
          <p className="document-summary">{article.summary}</p>
          <div className="article-meta">
            {article.kind === "blog" ? (
              <>
                <Link href={`/${locale}/about/`}>
                  {zh ? "Lavik 项目" : "Lavik project"}
                </Link>{" "}
                · {article.updatedAt}
                {article.sourceRevision ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={`https://github.com/eloqdata/lavik/tree/${article.sourceRevision}`}
                    >
                      {article.sourceRevision.slice(0, 7)}
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {zh ? "文档版本" : "Documentation"}: 0.1.0-beta.1 ·{" "}
                {release.tag} · {article.updatedAt}
              </>
            )}
          </div>
          {article.kind === "blog" ? (
            <>
              {article.id !== "lavik-0-1-0-released" &&
              article.updatedAt < "2026-10-13" ? (
                <p className="context-note">
                  {zh
                    ? `本文记录 ${article.updatedAt} 的工程实践与产品版本。`
                    : `Engineering article from ${article.updatedAt}; examples and measurements describe that release or source snapshot.`}{" "}
                  <Link href={`/${locale}/docs/0.1.0/`}>
                    {zh ? "当前 0.1.0 文档" : "Current 0.1.0 documentation"}
                  </Link>
                  {" · "}
                  <Link href={`/${locale}/benchmarks/`}>
                    {zh ? "最新基准测试" : "Latest benchmarks"}
                  </Link>
                </p>
              ) : null}
              <BlogTopicLinks article={article} />
              <div className="blog-cover-frame">
                <BlogCover article={article} priority />
              </div>
            </>
          ) : null}
          {article.kind === "release" || article.id === "quick-start" ? (
            <div className="download-box">
              <a
                href={
                  article.id === "quick-start"
                    ? `/${locale}/download/0.1.0-beta.1/`
                    : `https://github.com/eloqdata/lavik/releases/tag/${release.tag}`
                }
              >
                {zh ? "查看发布包与校验和" : "Release packages & checksums"} ↗
              </a>
              <p>
                {zh ? "当前固定版本" : "Pinned release"}: {release.tag}
              </p>
            </div>
          ) : null}
          {article.id === "quick-start" ? (
            <QuickStartSetup locale={locale} />
          ) : null}
          {article.technical ? (
            <TechnicalArticleBody article={article} />
          ) : articleReview(article).rendererVersion === 2 ? (
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
  }
  if (route === "cost")
    return (
      <main id="main" className="container wide-page">
        <p className="eyebrow">
          {zh ? "从性能结果推导经济性" : "From performance to economics"}
        </p>
        <h1>
          {zh
            ? "降低 Redis 数据集增长的容量成本。"
            : "Reduce the cost of growing Redis datasets."}
        </h1>
        <p className="page-lead">
          {zh
            ? "让增长的值数据使用 NVMe SSD 容量，减少对昂贵 DRAM 的需求。输入实际价格，计算你的数据集能节省多少容量成本。"
            : "Put growing value payloads on NVMe SSD and reduce the need for expensive DRAM. Enter your prices to calculate what that means for your dataset."}
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
        <div className="prose">
          <h2 id="worked-example">
            {zh
              ? "1 TiB 值数据的容量示例"
              : "A worked example: 1 TiB of value payload"}
          </h2>
          <p>
            {zh
              ? "假设每 GiB DRAM 和 NVMe SSD 的容量价格分别为 20 和 1 个成本单位。1 TiB 等于 1,024 GiB：仅值容量的 DRAM 成本为 20,480 个单位，NVMe SSD 为 1,024 个单位，节省 19,456 个单位（95%）。这些是解释比例的假设单位，不是硬件报价；索引内存、副本和共享服务器成本需另行加入。"
              : "Assume DRAM and NVMe SSD capacity prices of 20 and 1 cost units per GiB. One TiB is 1,024 GiB: value capacity alone costs 20,480 units in DRAM or 1,024 units on NVMe SSD, saving 19,456 units (95%). These are illustrative units, not hardware quotes; add index memory, replicas, and shared server costs separately."}
          </p>
          <p>
            {zh
              ? "使用下面的模型，调整索引内存和共同成本，查看部署成本比值如何变化。"
              : "Use the model below to see how index memory and shared costs change the deployment cost ratio."}
          </p>
        </div>
        <CostCalculator locale={locale} />
        <div className="prose">
          <h2>
            {zh
              ? "吞吐量也会影响所需节点数"
              : "Throughput also determines node count"}
          </h2>
          <p>
            {zh
              ? "容量成本只是预算的一部分。对于相同数据量与目标 QPS，单节点能完成更多请求，就可能减少为吞吐量增加的节点。产品对比页使用相同连接数的实测结果，将容量、吞吐余量、副本与节点单价组合成可调整的估算。"
              : "Capacity is one part of the budget. For a fixed dataset and QPS target, higher per-node throughput can reduce the nodes added to serve traffic. The comparison calculators combine measurements at matched concurrency with capacity, throughput headroom, replicas and node prices."}
          </p>
          <Link href={`/${locale}/compare/`}>
            {zh ? "按产品比较成本" : "Compare costs by product"} →
          </Link>
        </div>
      </main>
    );
  const kinds = {
    "use-cases": "use-case",
    releases: "release",
  } as const;
  const kind = kinds[route as keyof typeof kinds];
  if (!kind) notFound();
  const titles = {
    "use-case": zh ? "从你的应用出发。" : "Start with your application.",
    release: zh ? "Lavik 版本说明。" : "Lavik release notes.",
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
            ? "查看功能变化、升级步骤与各版本下载。"
            : "What changed, how to upgrade, and where to get each release."}
      </p>
      <div className="article-list">
        {kind === "release" && (
          <Link
            href={`/${locale}/releases/0-1-0/`}
            className="article-list-item"
          >
            <time>2026-10-13</time>
            <div>
              <h2>{stableReleaseNotes().title[locale]}</h2>
              <p>{stableReleaseNotes().summary[locale]}</p>
            </div>
            <span>↗</span>
          </Link>
        )}
        {pages
          .filter((a) => a.kind === kind)
          .sort(
            (a, b) =>
              b.updatedAt.localeCompare(a.updatedAt) ||
              a.title.localeCompare(b.title),
          )
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
