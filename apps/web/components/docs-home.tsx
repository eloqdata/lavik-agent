import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { release } from "../../../packages/content/repository";
import {
  manualCases,
  manualClients,
} from "../../../packages/manual/repository";
import { requireReviewedManual } from "../../../packages/manual/gate";
import { DocsSidebar } from "./docs-sidebar";
import { operationsGuides } from "../../../packages/operations/repository";

export function DocsHome({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const publication = requireReviewedManual();
  const root = `/${locale}/docs/0.1.0`;
  const clients = manualClients();
  const cards = [
    {
      title: zh ? "使用二进制安装" : "Install With Binary",
      href: `${root}/quick-start/`,
      label: "01",
      text: zh
        ? "选择 Minimal 或 Standard 发布包，直接在 Linux 上启动。"
        : "Choose a Minimal or Standard release package and start on Linux.",
    },
    {
      title: zh ? "使用 Docker 安装" : "Install With Docker",
      href: `${root}/install-docker/`,
      label: "02",
      text: zh
        ? "拉取官方 beta.1 镜像，以持久化卷运行独立实例。"
        : "Pull the official beta.1 image and run a standalone instance with a persistent volume.",
    },
    {
      title: zh ? "使用 Docker Compose 安装" : "Install With Docker Compose",
      href: `${root}/install-docker-compose/`,
      label: "03",
      text: zh
        ? "运行三个 Meta 节点及 Data 主从节点，体验复制、故障转移与恢复。"
        : "Run three Meta voters and a Data primary–follower pair with replication, failover and recovery.",
    },
  ];
  return (
    <main
      id="main"
      className="container document-layout docs-home"
      data-manual-hash={publication.bundleHash}
    >
      <DocsSidebar locale={locale} route="docs/0.1.0" />
      <article className="document">
        <div className="breadcrumb">
          <Link href={`/${locale}/`}>Lavik</Link>
          <span>/</span>
          <span>0.1.0</span>
        </div>
        <p className="eyebrow">
          {zh ? "面向真实应用的文档" : "DOCUMENTATION FOR BUILDERS"}
        </p>
        <h1>{zh ? "Lavik 文档" : "Lavik documentation"}</h1>
        <p className="document-summary">
          {zh
            ? "从第一次启动，到连接你的应用。按版本组织的安装、开发、运维与迁移指南。"
            : "From your first instance to your application's client. Versioned guides for installation, development, operations and migration."}
        </p>
        <div className="docs-release-note">
          <strong>{release.tag}</strong>
          <span>
            {zh
              ? "当前 beta · 文档版本 0.1.0"
              : "Current beta · documentation version 0.1.0"}
          </span>
          <Link href={`/${locale}/releases/`}>
            {zh ? "版本说明" : "Release notes"} →
          </Link>
        </div>
        <section aria-labelledby="start">
          <h2 id="start">{zh ? "从这里开始" : "Start here"}</h2>
          <div className="docs-start-grid">
            {cards.map((card) => (
              <Link
                className="docs-start-card"
                key={card.href}
                href={card.href}
              >
                <span className="eyebrow">{card.label}</span>
                <h3>{card.title} →</h3>
                <p>{card.text}</p>
              </Link>
            ))}
          </div>
        </section>
        <section aria-labelledby="reference">
          <h2 id="reference">
            {zh ? "找到你需要的参考资料" : "Find the reference you need"}
          </h2>
          <div className="docs-reference-grid">
            <Link href={`${root}/commands/`} className="docs-reference-card">
              <span className="eyebrow">
                {zh ? "命令参考" : "COMMAND REFERENCE"}
              </span>
              <strong>{manualCases().length}</strong>
              <h3>{zh ? "已收录命令" : "documented commands"} →</h3>
              <p>
                {zh
                  ? "搜索语法、具体调用、实测返回值及兼容性差异。"
                  : "Search syntax, specific calls, actual replies, and compatibility differences."}
              </p>
            </Link>
            <Link href={`${root}/clients/`} className="docs-reference-card">
              <span className="eyebrow">
                {zh ? "客户端兼容性" : "CLIENT COMPATIBILITY"}
              </span>
              <strong>{clients.length}</strong>
              <h3>{zh ? "客户端配置" : "client configurations"} →</h3>
              <p>
                {zh
                  ? `涵盖 ${new Set(clients.map((c) => c.language)).size} 种语言，包含精确版本、协议与连接设置。`
                  : `${new Set(clients.map((c) => c.language)).size} languages, with exact versions, protocols, and connection settings.`}
              </p>
            </Link>
          </div>
        </section>
        <section aria-labelledby="migrate">
          <h2 id="migrate">{zh ? "迁移到 Lavik" : "Migrating To Lavik"}</h2>
          <div className="docs-guide-list">
            <Link href={`${root}/migrate-redis/`}>
              <h3>{zh ? "从 Redis 迁移" : "From Redis"} →</h3>
              <p>
                {zh
                  ? "规划复制、追平、暂停写入和应用切换。"
                  : "Plan replication, catch-up, a write pause and application cutover."}
              </p>
            </Link>
            <Link href={`${root}/migrate-redis-cluster/`}>
              <h3>{zh ? "从 Redis Cluster 迁移" : "From Redis Cluster"} →</h3>
              <p>
                {zh
                  ? "盘点源主节点与槽位，汇入独立 Lavik。"
                  : "Inventory source primaries and slots, then consolidate into standalone Lavik."}
              </p>
            </Link>
          </div>
        </section>
        <section aria-labelledby="evaluate">
          <h2 id="evaluate">
            {zh ? "为迁移做好准备" : "Plan your evaluation"}
          </h2>
          <div className="docs-guide-list">
            <Link href={`${root}/compatibility/`}>
              <h3>
                {zh ? "Redis / Valkey 兼容性" : "Redis / Valkey compatibility"}{" "}
                →
              </h3>
              <p>
                {zh
                  ? "从你的实际命令与客户端行为出发，了解当前支持范围。"
                  : "Start with your application's commands and client behavior, and check the current scope."}
              </p>
            </Link>
            <Link href={`${root}/storage/`}>
              <h3>{zh ? "存储与持久化" : "Storage & durability"} →</h3>
              <p>
                {zh
                  ? "理解值存储、内存索引和持久化边界。"
                  : "Understand value storage, in-memory indexes, and durability boundaries."}
              </p>
            </Link>
            <Link href={`/${locale}/benchmarks/`}>
              <h3>
                {zh ? "性能与实验条件" : "Performance & test conditions"} →
              </h3>
              <p>
                {zh
                  ? "查看吞吐量、延迟和原始报告，设计自己的实验。"
                  : "Inspect throughput, latency, and the original reports before designing your own experiment."}
              </p>
            </Link>
          </div>
        </section>
        <section className="docs-upstream" aria-labelledby="operations">
          <h2>
            {zh
              ? "使用 lavik-ctl 部署与管理"
              : "Deploy and manage with lavik-ctl"}
          </h2>
          <div className="docs-guide-list">
            {operationsGuides.map((guide) => (
              <Link key={guide.id} href={`${root}/${guide.id}/`}>
                <h3>{guide.title[locale]} →</h3>
                <p>{guide.summary[locale]}</p>
              </Link>
            ))}
          </div>
          <h2 id="operations">
            {zh ? "继续阅读：运维指南" : "Go further: operations guides"}
          </h2>
          <p>
            {zh
              ? "查看本版本的详细调优与部署指南。"
              : "Read the detailed tuning and deployment guides for this release."}
          </p>
          <ul>
            {[
              ["quick-start-tuning", zh ? "启动调优" : "Startup tuning"],
              ["cluster-deployment", zh ? "集群部署" : "Cluster deployment"],
              [
                "building-and-packaging",
                zh ? "构建与打包" : "Building and packaging",
              ],
            ].map(([slug, title]) => (
              <li key={slug}>
                <a
                  className="text-link"
                  href={`https://github.com/eloqdata/lavik/blob/${release.commit}/docs/operations/${slug}.md`}
                >
                  {title} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
        <div className="docs-help">
          <p>
            {zh
              ? "有疑问，或发现文档遗漏？"
              : "Have a question or found a gap?"}
          </p>
          <Link className="text-link" href={`/${locale}/community/`}>
            {zh ? "加入 Lavik Community" : "Join Lavik Community"} →
          </Link>
        </div>
      </article>
    </main>
  );
}
