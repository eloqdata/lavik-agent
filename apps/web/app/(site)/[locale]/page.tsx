import Link from "next/link";
import type { Metadata } from "next";
import {
  claims,
  release,
  sources,
} from "../../../../../packages/content/repository";
import { localeSchema } from "../../../../../packages/content/schema";
import {
  benchmarkRows,
  currentBenchmark,
} from "../../../../../packages/content/benchmarks";
import { BenchmarkChart } from "../../../components/benchmark";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: {
      absolute:
        locale === "en"
          ? "Lavik — Redis-class performance. NVMe-scale capacity."
          : "Lavik — 接近内存的性能，NVMe 级容量。",
    },
    description:
      locale === "en"
        ? "An open-source Redis-compatible key-value store built around NVMe storage. Explore the benchmarks and evaluate Lavik 0.1.0."
        : "围绕 NVMe 存储构建的开源 Redis 兼容键值数据库。查看基准测试，运行示例，评估 Lavik 0.1.0。",
    alternates: {
      canonical: `/${locale}/`,
      languages: { en: "/en/", "zh-CN": "/zh-CN/" },
    },
  };
}
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = localeSchema.parse((await params).locale),
    zh = locale === "zh-CN";
  const rows = benchmarkRows();
  const [lavik, redis] = rows;
  const getLead = ((lavik.get / redis.get - 1) * 100).toFixed(1);
  const setLead = ((lavik.set / redis.set - 1) * 100).toFixed(1);
  return (
    <main id="main">
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <Link
              className="release-label"
              href={`/${locale}/releases/0-1-0-beta-1/`}
            >
              <span className="status-dot" />
              {zh ? "现在开始探索" : "Ready to explore"} · v{release.release}
              <span>↗</span>
            </Link>
            <h1>
              {zh ? (
                <>
                  接近内存的性能。
                  <br />
                  <em>NVMe 级容量。</em>
                </>
              ) : (
                <>
                  Redis-class speed.
                  <br />
                  <em>Room to grow.</em>
                </>
              )}
            </h1>
            <p className="hero-description">
              {zh
                ? "将值存储在 NVMe 上，用熟悉的 Redis 接口访问。探索一个围绕现代存储构建的开源键值数据库。"
                : "Keep your values on NVMe and your familiar Redis interface. Explore an open-source key-value store built around modern storage."}
            </p>
            <div className="actions">
              <Link
                className="button primary"
                href={`/${locale}/docs/0.1.0/quick-start/`}
              >
                {zh ? "开始使用" : "Start building"}
                <span>→</span>
              </Link>
              <Link
                className="button secondary"
                href={`/${locale}/benchmarks/`}
              >
                {zh ? "查看基准测试" : "Explore the benchmarks"}
              </Link>
            </div>
            <div className="hero-facts">
              <span>Apache 2.0</span>
              <span>RESP2 / RESP3</span>
              <span>Linux · x86_64 / ARM64</span>
            </div>
          </div>
          <div
            className="storage-visual"
            aria-label={
              zh
                ? "键索引保留在 DRAM 中，值存储在 NVMe 上"
                : "Key index in DRAM, values on NVMe"
            }
          >
            <div className="visual-grid" />
            <div className="storage-title">CAPACITY, RECONSIDERED</div>
            <div className="memory-module">
              <span>DRAM</span>
              <div className="memory-chips">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <i key={i} />
                ))}
              </div>
              <small>{zh ? "紧凑的键索引" : "Compact key index"}</small>
            </div>
            <div className="data-path">
              <span />
              <span />
              <span />
            </div>
            <div className="disk-stack">
              {[0, 1, 2].map((i) => (
                <div className="disk" key={i}>
                  <span>NVMe</span>
                  <i />
                  <i />
                  <small>{i === 0 ? "01" : i === 1 ? "02" : "03"}</small>
                </div>
              ))}
            </div>
            <div className="visual-caption">
              <span className="status-dot" />
              {zh ? "让存储承载数据容量" : "Let storage carry the capacity"}
            </div>
          </div>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {zh ? "数据，附上测试条件" : "Numbers, with the context"}
            </p>
            <h2>{zh ? "让结果自己说话。" : "Performance you can inspect."}</h2>
          </div>
          <Link className="text-link" href={`/${locale}/benchmarks/`}>
            {zh ? "测试方法与完整结果" : "Methodology & full results"} ↗
          </Link>
        </div>
        <div className="benchmark-grid">
          <div className="benchmark-intro">
            <span className="large-stat">
              {(lavik.get / 1_000_000).toFixed(2)}
              <span>M</span>
            </span>
            <h3>
              {zh
                ? "SPDK 上的 GET 请求 / 秒"
                : "GET requests / second with SPDK"}
            </h3>
            <p>
              {zh
                ? `在已发布的 1 KiB 实验中，Lavik 0.1.0 SPDK 的 GET 和 SET 峰值吞吐量分别比 Redis 8.8.0 高 ${getLead}% 和 ${setLead}%。`
                : `In the published 1 KiB experiment, Lavik 0.1.0 SPDK’s peak GET and SET throughput exceeded Redis 8.8.0 by ${getLead}% and ${setLead}%, respectively.`}
            </p>
            <span className="small-label">
              {zh
                ? `SPDK 基准 · ${currentBenchmark.date} · ${currentBenchmark.release}`
                : `SPDK benchmark · ${currentBenchmark.date} · ${currentBenchmark.release}`}
            </span>
          </div>
          <BenchmarkChart rows={rows} locale={locale} />
        </div>
        <p className="benchmark-context">
          {currentBenchmark.scope[locale]}{" "}
          <a
            href={sources.find((s) => s.id === currentBenchmark.sourceId)!.url}
          >
            {zh ? "原始报告" : "Source report"} ↗
          </a>
        </p>
      </section>
      <section className="feature-section">
        <div className="container">
          <p className="eyebrow">
            {zh
              ? "熟悉的接口，新的容量空间"
              : "A familiar interface. A different capacity tier."}
          </p>
          <div className="feature-grid">
            <article>
              <span className="feature-number">01 / CAPACITY</span>
              <h3>{zh ? "让值走出内存。" : "Give your values more room."}</h3>
              <p>
                {claims.find((c) => c.id === "storage-model")!.text[locale]}
              </p>
            </article>
            <article>
              <span className="feature-number">02 / INTERFACE</span>
              <h3>
                {zh ? "从已有的工具出发。" : "Start with the tools you know."}
              </h3>
              <p>{claims.find((c) => c.id === "protocol")!.text[locale]}</p>
            </article>
            <article>
              <span className="feature-number">03 / OPEN SOURCE</span>
              <h3>
                {zh ? "自由探索，亲手构建。" : "Explore it. Build with it."}
              </h3>
              <p>{claims.find((c) => c.id === "license")!.text[locale]}</p>
            </article>
          </div>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {zh ? "从好奇到验证" : "From curious to hands-on"}
            </p>
            <h2>
              {zh ? "从你的工作负载开始。" : "Find out where Lavik fits."}
            </h2>
          </div>
        </div>
        <div className="resource-grid">
          {[
            [
              "01",
              zh ? "运行第一组命令" : "Run your first commands",
              zh
                ? "查看版本化示例及实际执行结果。"
                : "Follow a versioned example with recorded execution results.",
              "docs/0.1.0/quick-start",
            ],
            [
              "02",
              zh ? "理解容量经济性" : "Explore the capacity economics",
              zh
                ? "调整假设，计算 DRAM 与 SSD 的成本差异。"
                : "Adjust the assumptions behind a DRAM-to-SSD cost comparison.",
              "cost",
            ],
            [
              "03",
              zh ? "阅读测试边界" : "Read the benchmark closely",
              zh
                ? "了解吞吐量、尾延迟与测试配置。"
                : "Understand throughput, tail latency, and the tested configuration.",
              "blog/reading-the-benchmark",
            ],
          ].map(([number, title, description, url]) => (
            <Link
              className="resource-card"
              key={number}
              href={`/${locale}/${url}/`}
            >
              <span>
                {number} <b>↗</b>
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </Link>
          ))}
        </div>
      </section>
      <section className="container closing">
        <div>
          <p className="eyebrow">
            {zh ? "用真实结果判断" : "Put it to the test"}
          </p>
          <h2>
            {zh
              ? "你的下一组数据，\n可以有更大的空间。"
              : "Make room for your next dataset."}
          </h2>
        </div>
        <Link
          className="button primary"
          href={`/${locale}/docs/0.1.0/overview/`}
        >
          {zh ? "阅读 0.1.0 文档" : "Read the 0.1.0 docs"} →
        </Link>
      </section>
    </main>
  );
}
