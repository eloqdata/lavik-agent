import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { release } from "../../../packages/content/repository";
import {
  manualCases,
  manualClients,
} from "../../../packages/manual/repository";
import { requireReviewedManual } from "../../../packages/manual/gate";
import { DocsSidebar } from "./docs-sidebar";

export function DocsHome({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const publication = requireReviewedManual();
  const root = `/${locale}/docs/0.1.0`;
  const clients = manualClients();
  const cards = [
    {
      title: zh ? "下载与安装" : "Download & install",
      href: `/${locale}/download/`,
      label: "01",
      text: zh
        ? "选择 Linux 架构与发布包，检查平台要求和校验和。"
        : "Choose a Linux architecture and package. Check requirements and checksums.",
    },
    {
      title: zh ? "运行第一组命令" : "Run your first commands",
      href: `${root}/quick-start/`,
      label: "02",
      text: zh
        ? "启动独立实例，执行示例，并对照已记录的运行结果。"
        : "Start a standalone instance, run the examples, and compare the recorded results.",
    },
    {
      title: zh ? "连接你的应用" : "Connect your application",
      href: `${root}/clients/`,
      label: "03",
      text: zh
        ? "找到你的语言与客户端，查看准确版本、配置和实际执行的代码。"
        : "Find your language and client, with exact versions, settings, and executed code.",
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
            ? "从第一次启动，到连接你的应用。按版本组织的指南，配有在真实 Lavik 上执行的命令与客户端示例。"
            : "From your first instance to your application's client. Versioned guides, with command and client examples executed against real Lavik."}
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
              <h3>{zh ? "经过测试的命令名称" : "command names tested"} →</h3>
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
              <h3>
                {zh ? "经过测试的客户端配置" : "client configurations tested"} →
              </h3>
              <p>
                {zh
                  ? `涵盖 ${new Set(clients.map((c) => c.language)).size} 种语言，包含精确版本、协议与连接设置。`
                  : `${new Set(clients.map((c) => c.language)).size} languages, with exact versions, protocols, and connection settings.`}
              </p>
            </Link>
          </div>
          <p className="docs-scope">
            {zh
              ? "测试范围仅限于各页面展示的调用、配置与结果。ADDREPLICAOF 仅验证了拒绝行为；本套测试不验证完整命令选项、集群、故障转移或生产 SLA。"
              : "Tests cover the calls, settings, and replies shown on each page. ADDREPLICAOF has rejection coverage only. This suite does not verify every command option, cluster behavior, failover, or production SLAs."}
          </p>
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
          <h2 id="operations">
            {zh ? "继续阅读：运维指南" : "Go further: operations guides"}
          </h2>
          <p>
            {zh
              ? "以下链接指向与本版本源码提交对应的上游指南。这些运维流程不属于本站本地命令与客户端测试的验证范围。"
              : "These links open upstream guides at this release's source commit. The operational procedures are outside this site's local command and client verification."}
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
