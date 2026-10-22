import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Locale } from "../../../packages/content/schema";
import {
  benchmarkReports,
  benchmarkRoute,
  type BenchmarkReport,
} from "../../../packages/benchmarks/catalog";
import {
  reportMarkdown,
  reportSourceUrl,
  reportLink,
  reportSections,
  headingId,
  assetUrl,
} from "../../../packages/benchmarks/repository";
import { assertBenchmarkPublication } from "../../../packages/benchmarks/gate";
import { BenchmarkCode } from "./benchmark-code";
import { BenchmarkSnapshot } from "./benchmark-snapshot";
import { homepageBenchmarkRows } from "../../../packages/benchmarks/homepage";
import { rawArchiveUrl } from "../../../packages/benchmarks/raw-data";
const text = (children: ReactNode): string =>
  Children.toArray(children)
    .map((c) =>
      typeof c === "string" || typeof c === "number"
        ? String(c)
        : isValidElement<{ children?: ReactNode }>(c)
          ? text(c.props.children)
          : "",
    )
    .join("");
export function BenchmarksHome({ locale }: { locale: Locale }) {
  assertBenchmarkPublication();
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="container benchmark-home">
      <header className="benchmark-hero">
        <p className="eyebrow">
          LAVIK 0.2.0 · {zh ? "公开基准测试" : "PUBLISHED BENCHMARKS"}
        </p>
        <h1>
          {zh
            ? "NVMe SSD 容量。\n用实测性能说话。"
            : "NVMe SSD capacity.\nMeasured performance."}
        </h1>
        <p className="page-lead">
          {zh
            ? "从 2 vCPU 小型实例到十亿键数据集，查看吞吐量、尾延迟和完整复现方法，选择与你的工作负载相符的测试。"
            : "From a 2-vCPU instance to a billion-key dataset: explore throughput, tail latency, and complete reproduction procedures. Choose the experiment that matches your workload."}
        </p>
        <div className="benchmark-hero-facts">
          <span>4 {zh ? "个主题 · 3 份报告" : "topics · 3 reports"}</span>
          <span>2026-10-21 / 22</span>
          <span>NVMe SSD · SPDK / io_uring</span>
        </div>
      </header>
      <section
        className="benchmark-cards"
        aria-label={zh ? "基准测试报告" : "Benchmark reports"}
      >
        {benchmarkReports.map((r, i) => (
          <article className="benchmark-card" key={r.id}>
            <p className="eyebrow">
              0{i + 1} / {r.label[locale]}
            </p>
            <h2>
              <Link href={"/" + locale + "/" + benchmarkRoute(r.id) + "/"}>
                {r.title[locale]} <span aria-hidden="true">↗</span>
              </Link>
            </h2>
            <p>{r.summary[locale]}</p>
            <div className="benchmark-card-number">
              <strong>{r.stats[0].value}</strong>
              <span>{r.stats[0].label[locale]}</span>
            </div>
            <p className="benchmark-card-context">{r.takeaway[locale]}</p>
            <Link
              className="text-link"
              href={"/" + locale + "/" + benchmarkRoute(r.id) + "/"}
            >
              {zh ? "图表、结果与复现步骤" : "Charts, results & reproduction"} →
            </Link>
          </article>
        ))}
      </section>
      <section className="benchmark-reading">
        <h2>{zh ? "选对比较方式" : "Choose the right comparison"}</h2>
        <div>
          <p>
            {zh
              ? "容量：2 vCPU 报告比较 Lavik 的 100 万键和 1 亿键；Redis 与 Valkey 对照仅为 100 万键。"
              : "Capacity: the 2-vCPU report compares Lavik at 1M and 100M keys; Redis and Valkey controls use 1M keys."}
          </p>
          <p>
            {zh
              ? "延迟：所有新报告使用客户端完整测量窗口的 p99.9。请同时查看连接数或目标速率，以及对应的吞吐量。"
              : "Latency: the new reports use client-observed whole-window p99.9. Read it alongside connection count or target rate and the corresponding throughput."}
          </p>
          <p>
            {zh
              ? "方法：每点或每窗口只测一次，未估计置信区间。缓存、持久化、CPU、预热等条件均列在各报告中。"
              : "Method: each point or window is measured once, without confidence intervals. Cache, persistence, CPU and warmup conditions are documented per report."}
          </p>
        </div>
        <Link href={"/" + locale + "/download/"}>
          {zh ? "下载受测版本" : "Download the tested release"} →
        </Link>
      </section>
    </main>
  );
}
export function BenchmarkReportPage({
  locale,
  report: r,
}: {
  locale: Locale;
  report: BenchmarkReport;
}) {
  assertBenchmarkPublication();
  const zh = locale === "zh-CN",
    sections = reportSections(r, locale);
  return (
    <main id="main" className="container benchmark-detail">
      <nav className="breadcrumb" aria-label={zh ? "面包屑" : "Breadcrumb"}>
        <Link href={"/" + locale + "/benchmarks/"}>
          {zh ? "基准测试" : "Benchmarks"}
        </Link>
        <span>/</span>
        <span>{r.label[locale]}</span>
      </nav>
      <header className="benchmark-report-hero">
        <p className="eyebrow">LAVIK 0.2.0 · {r.date}</p>
        <h1>{r.title[locale]}</h1>
        <p className="page-lead">{r.summary[locale]}</p>
        <p className="benchmark-scope">{r.scope[locale]}</p>
        <div className="benchmark-stats">
          {r.stats.map((s) => (
            <div key={s.value}>
              <strong>{s.value}</strong>
              <span>{s.label[locale]}</span>
            </div>
          ))}
        </div>
        <p className="benchmark-takeaway">{r.takeaway[locale]}</p>
        <details className="benchmark-context">
          <summary>
            {zh ? "测试条件与结果解读" : "Test conditions and interpretation"}
          </summary>
          <p>{r.caveat[locale]}</p>
        </details>
        <div className="benchmark-actions">
          <a href="#reproduce">{zh ? "复现此测试" : "Reproduce this test"} ↓</a>
          <a href={reportSourceUrl(r, locale)}>
            {zh ? "GitHub 原始报告" : "Original report on GitHub"} ↗
          </a>
          <a href={rawArchiveUrl(r.directory)}>
            {zh ? "原始测量数据与校验和" : "Raw measurements & checksums"} ↗
          </a>
          <a
            href={assetUrl(
              r,
              locale === "en" ? "README.md" : "README.zh-CN.md",
            )}
            download
          >
            {zh ? "下载完整步骤" : "Download full procedure"} ↓
          </a>
        </div>
      </header>
      <div className="benchmark-report-layout">
        <aside className="benchmark-toc">
          <nav aria-label={zh ? "本页目录" : "On this page"}>
            <strong>{zh ? "本页内容" : "On this page"}</strong>
            <a href="#reproduce">{zh ? "复现路线" : "Reproduction roadmap"}</a>
            {sections.map((s) => (
              <a key={s.id} href={"#" + s.id}>
                {s.text}
              </a>
            ))}
          </nav>
          <nav aria-label={zh ? "其他基准测试" : "More benchmarks"}>
            <strong>{zh ? "全部基准测试" : "All benchmarks"}</strong>
            {benchmarkReports.map((other) => (
              <Link
                key={other.id}
                aria-current={other.id === r.id ? "page" : undefined}
                href={"/" + locale + "/" + benchmarkRoute(other.id) + "/"}
              >
                {other.label[locale]}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="benchmark-report-content">
          <section id="reproduce" className="benchmark-roadmap">
            <h2>
              {zh
                ? "从环境到结果：复现路线"
                : "From setup to results: reproduction roadmap"}
            </h2>
            <ol>
              {r.steps.map((s, i) => (
                <li key={i}>{s[locale]}</li>
              ))}
            </ol>
            <p>
              {zh
                ? "下方完整报告提供发布版本、主机条件、服务端配置、加载、预热、测量与验证命令。路径、地址和 PCI 标识来自测试环境，使用前须替换。格式化或清空仅适用于确认无数据的专用测试设备。"
                : "The full report below includes release versions, host conditions, server configurations, loading, warmup, measurement and validation commands. Paths, addresses and PCI identities describe the measured environment; adapt them before use. Format or clear only verified empty, dedicated test devices."}
            </p>
          </section>
          {r.id === "1tb-storage" ? (
            <BenchmarkSnapshot locale={locale} />
          ) : r.id === "redis-valkey" ? (
            <BenchmarkSnapshot
              locale={locale}
              rows={homepageBenchmarkRows}
              scope="memory"
            />
          ) : null}
          <div className="benchmark-report prose">
            <Markdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              urlTransform={(url) =>
                reportLink(r, defaultUrlTransform(url), locale)
              }
              components={{
                h2: ({ children }) => (
                  <h2 id={headingId(text(children))}>{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 id={headingId(text(children))}>{children}</h3>
                ),
                table: ({ children }) => (
                  <div
                    className="benchmark-table-scroll"
                    role="region"
                    aria-label={zh ? "报告数据表" : "Report data table"}
                    tabIndex={0}
                  >
                    <table>{children}</table>
                  </div>
                ),
                img: ({ src, alt }) => (
                  <a
                    className="benchmark-original-chart"
                    href={typeof src === "string" ? src : undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={src} alt={alt ?? ""} loading="lazy" />
                    <span>
                      {zh ? "打开完整图表" : "Open full-size chart"} ↗
                    </span>
                  </a>
                ),
                pre: ({ children }) => {
                  const child = Children.toArray(children).find((c) =>
                    isValidElement(c),
                  );
                  const language = isValidElement<{ className?: string }>(child)
                    ? (child.props.className?.replace("language-", "") ?? "")
                    : "";
                  return (
                    <BenchmarkCode
                      code={text(children)}
                      language={language}
                      locale={locale}
                    />
                  );
                },
              }}
            >
              {reportMarkdown(r, locale)}
            </Markdown>
          </div>
          <footer className="benchmark-report-footer">
            <p>
              {zh
                ? "数据、图表与命令来自本页所链接的发布报告。报告通过固定提交提供，可用于检查版本、测量条件与复现步骤。"
                : "Data, charts and commands come from the published report linked on this page. The report is pinned to a source commit so its versions, measurement conditions and reproduction procedure can be inspected."}
            </p>
            <Link href={"/" + locale + "/download/"}>
              {zh ? "下载 Lavik 0.2.0" : "Download Lavik 0.2.0"} →
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
