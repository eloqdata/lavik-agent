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
import { estimateCost } from "../../../../../packages/content/economics";

// Compare the value-capacity tier; index memory and shared server costs are separate.
const capacityCost = estimateCost({
  dramPerGiB: 20,
  ssdPerGiB: 1,
  datasetGiB: 1,
  indexFraction: 0,
  storageAmplification: 1,
  sharedCost: 0,
});
const capacityRatio = capacityCost.capacityRatio.toFixed(0);
const capacitySavings = capacityCost.savingsPercent.toFixed(0);

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
          ? `Lavik — Redis-class speed. ${capacityRatio}× lower capacity cost.`
          : `Lavik — Redis 级性能，容量成本降至 1/${capacityRatio}。`,
    },
    description:
      locale === "en"
        ? "Move your Redis/Valkey workload to NVMe with Lavik. A 20:1 DRAM/NVMe price ratio means 95% lower value-capacity cost. Redis-class benchmark performance. Apache 2.0."
        : "用 Lavik 将 Redis/Valkey 工作负载迁至 NVMe。按 DRAM/NVMe 单价比 20:1，值容量成本降低 95%。Redis 级基准性能，Apache 2.0 开源。",
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
  const [lavik] = rows;
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
              {zh ? "开源，免费使用" : "Open source. Free to use."} · v
              {release.release}
              <span>↗</span>
            </Link>
            <h1>
              {zh ? (
                <>
                  Redis 级性能。
                  <br />
                  <em>容量成本降至 1/{capacityRatio}。</em>
                </>
              ) : (
                <>
                  Redis-class speed.
                  <br />
                  <em>
                    {capacityRatio}× lower
                    <br />
                    capacity cost.
                  </em>
                </>
              )}
            </h1>
            <p className="hero-description">
              {zh
                ? "用 NVMe 替代昂贵的 DRAM 来存储值。Lavik 为 Redis / Valkey 工作负载带来全新的成本结构：熟悉的 Redis 接口、实测百万级 QPS，以及随 SSD 扩展的数据容量。"
                : "Replace expensive DRAM with NVMe for your values. Lavik gives Redis / Valkey workloads a new cost structure: familiar Redis clients, a measured million requests per second, and capacity that grows with SSDs."}
            </p>
            <div className="actions">
              <Link
                className="button primary"
                href={`/${locale}/docs/0.1.0/quick-start/`}
              >
                {zh ? "开始使用 Lavik" : "Start with Lavik"}
                <span>→</span>
              </Link>
              <Link className="button secondary" href={`/${locale}/cost/`}>
                {zh ? "计算你的成本节省" : "Calculate your savings"}
              </Link>
            </div>
            <div className="hero-facts">
              <span>Apache 2.0</span>
              <span>RESP2 / RESP3</span>
              <span>Linux · x86_64 / ARM64</span>
            </div>
          </div>
          <aside className="capacity-card" aria-labelledby="capacity-title">
            <p className="eyebrow">
              {zh
                ? "DRAM → NVMe · 改变成本结构"
                : "DRAM → NVMe · CHANGE THE ECONOMICS"}
            </p>
            <div className="capacity-saving">
              <strong>
                {capacitySavings}
                <span>%</span>
              </strong>
              <h2 id="capacity-title">
                {zh ? "更低的值容量成本" : "less spent on value capacity"}
              </h2>
            </div>
            <p className="capacity-subtitle">
              {zh
                ? "相同的数据量，更低的容量单价。"
                : "Same amount of data. A different price for capacity."}
            </p>
            <div className="capacity-comparison">
              <div className="capacity-row">
                <div>
                  <span>
                    Redis / Valkey <small>DRAM</small>
                  </span>
                  <strong>100%</strong>
                </div>
                <div className="capacity-track" aria-hidden="true">
                  <div className="capacity-dram" />
                </div>
              </div>
              <div className="capacity-row">
                <div>
                  <span>
                    Lavik <small>NVMe</small>
                  </span>
                  <strong>
                    {(100 / capacityCost.capacityRatio).toFixed(0)}%
                  </strong>
                </div>
                <div className="capacity-track" aria-hidden="true">
                  <div
                    className="capacity-nvme"
                    style={{ width: `${100 / capacityCost.capacityRatio}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="capacity-architecture">
              <span>
                DRAM <strong>{zh ? "紧凑键索引" : "Compact key index"}</strong>
              </span>
              <span>
                NVMe{" "}
                <strong>{zh ? "承载值容量" : "Room for your values"}</strong>
              </span>
            </div>
            <p className="capacity-assumption">
              {zh
                ? `按 DRAM / NVMe 每 GiB 单价比 ${capacityRatio}:1 计算，值容量成本为 1/${capacityRatio}。索引内存、存储放大和服务器等成本另计。`
                : `At a ${capacityRatio}:1 DRAM / NVMe price per GiB, value capacity costs 1/${capacityRatio} as much. Index memory, storage amplification, and server costs are additional.`}{" "}
              <Link href={`/${locale}/cost/`}>
                {zh ? "按你的配置计算" : "Model your deployment"} ↗
              </Link>
            </p>
          </aside>
        </div>
      </section>
      <section className="container section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {zh
                ? "用性能证明 NVMe 的实力"
                : "The performance behind the savings"}
            </p>
            <h2>
              {zh
                ? "数据在 NVMe，性能比肩内存。"
                : "NVMe storage. In-memory-class performance."}
            </h2>
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
                ? "Lavik 将值存储在 NVMe，Redis 和 Valkey 将数据放在内存。在已发布的 1 KiB 实验中，Lavik SPDK 的 GET / SET 峰值吞吐量均超过两者，p99 延迟处于相近水平。"
                : "Lavik stores values on NVMe. Redis and Valkey keep them in memory. In the published 1 KiB experiment, Lavik SPDK exceeded both peers’ peak GET and SET throughput, with comparable p99 latency."}
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
              ? "为什么用 Lavik 替代 Redis / Valkey？"
              : "Why switch from Redis / Valkey?"}
          </p>
          <div className="feature-grid">
            <article>
              <span className="feature-number">
                01 / {zh ? "容量成本" : "LOWER CAPACITY COST"}
              </span>
              <h3>{zh ? "扩容，用 SSD 的价格。" : "Grow at SSD prices."}</h3>
              <p>
                {zh
                  ? "新增值容量由 NVMe 承载，减少对昂贵 DRAM 扩容的依赖。"
                  : "Put growing value capacity on NVMe and reduce the need for expensive DRAM upgrades."}
              </p>
              <p>
                {claims.find((c) => c.id === "storage-model")!.text[locale]}
              </p>
            </article>
            <article>
              <span className="feature-number">02 / INTERFACE</span>
              <h3>
                {zh ? "沿用熟悉的 Redis 客户端。" : "Keep your Redis clients."}
              </h3>
              <p>{claims.find((c) => c.id === "protocol")!.text[locale]}</p>
            </article>
            <article>
              <span className="feature-number">03 / OPEN SOURCE</span>
              <h3>
                {zh ? "Apache 2.0，免费使用。" : "Apache 2.0. Free to use."}
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
              {zh
                ? "从你的 Redis / Valkey 工作负载开始"
                : "Bring your Redis / Valkey workload"}
            </p>
            <h2>
              {zh
                ? "下一次扩容，选择 NVMe。"
                : "Make your next capacity upgrade NVMe."}
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
              zh ? "算出你的成本节省" : "Calculate your savings",
              zh
                ? "调整假设，计算 DRAM 与 SSD 的成本差异。"
                : "Adjust the assumptions behind a DRAM-to-SSD cost comparison.",
              "cost",
            ],
            [
              "03",
              zh ? "检查应用兼容性" : "Check your application’s compatibility",
              zh
                ? "确认应用使用的命令、持久性和运维需求。"
                : "Match your commands, durability, and operational requirements.",
              "docs/0.1.0/compatibility",
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
          <p className="eyebrow">{zh ? "现在就开始" : "Start today"}</p>
          <h2>
            {zh
              ? "把值迁到 NVMe。\n把预算留给增长。"
              : "Move your values to NVMe.\nPut your budget into growth."}
          </h2>
        </div>
        <Link
          className="button primary"
          href={`/${locale}/docs/0.1.0/quick-start/`}
        >
          {zh ? "免费试用 Lavik" : "Try Lavik for free"} →
        </Link>
      </section>
    </main>
  );
}
