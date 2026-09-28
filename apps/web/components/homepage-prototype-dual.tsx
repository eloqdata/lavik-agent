"use client";

// THROWAWAY G: product identity on the left, paired performance/cost graphs on the right.
// Throughput is measured. Cost is illustrative: Dragonfly's homepage gives
// Valkey/Redis memory examples of 400/500 GB; Lavik uses our SSD price assumption.
import Link from "next/link";
import { BenchmarkChart } from "./benchmark";
import type { Props } from "./homepage-prototype";
import "./homepage-prototype-dual.css";

export function VariantG({
  locale,
  rows,
  capacityRatio,
  sourceUrl,
  benchmarkDate,
  benchmarkScope,
}: Props) {
  const zh = locale === "zh-CN";
  const costPercent = 100 / Number(capacityRatio);
  const valkeyPercent = (400 / 500) * 100;
  return (
    <main id="main" className="homepage-prototype prototype-g" data-variant="G">
      <section className="dual-hero container">
        <div className="dual-intro">
          <span className="dual-kicker">
            <i aria-hidden="true" /> LAVIK /{" "}
            {zh ? "开源数据库" : "OPEN SOURCE DATABASE"}
          </span>
          <h1>
            <em>{zh ? "基于 SSD 的" : "SSD-based"}</em>
            <span>{zh ? "Redis 兼容" : "Redis-compatible"}</span>
            <span>{zh ? "数据库。" : "database."}</span>
          </h1>
          <p className="dual-lead">
            {zh
              ? "吞吐超越内存。容量按 SSD 的价格增长。"
              : "Beyond in-memory throughput. Capacity at SSD prices."}
          </p>
          <p className="dual-description">
            {zh
              ? "在已发布的测试中，Lavik 的峰值吞吐量超过内存 Redis 和 Valkey。在容量成本示意模型中，成本为 Redis 的 1/20。"
              : "Lavik delivers higher peak throughput than in-memory Redis and Valkey in published tests. Our illustrative capacity-cost model puts Lavik at 1/20 of Redis."}
          </p>
          <div className="dual-actions">
            <Link href={`/${locale}/docs/0.1.0/quick-start/`}>
              {zh ? "开始使用 Lavik" : "Start with Lavik"}{" "}
              <span aria-hidden="true">→</span>
            </Link>
            <Link href={`/${locale}/benchmarks/`}>
              {zh ? "查看基准测试" : "See benchmarks"}{" "}
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <p className="dual-compatible">
            Redis clients <span>·</span> RESP2 / RESP3 <span>·</span> Apache 2.0
          </p>
        </div>

        <div className="dual-evidence">
          <article className="dual-card" aria-labelledby="dual-speed-title">
            <div className="dual-result">
              <span className="dual-result-number">
                01 / {zh ? "性能" : "PERFORMANCE"}
              </span>
              <h2 id="dual-speed-title">{zh ? "更快" : "Faster"}</h2>
              <p>
                {zh ? "超过内存" : "than in-memory"}
                <br />
                Redis / Valkey
              </p>
              <span className="dual-result-note">
                {zh ? "已发布峰值吞吐测试" : "Published peak throughput"}
              </span>
            </div>
            <div className="dual-throughput">
              <BenchmarkChart rows={rows} locale={locale} />
            </div>
          </article>

          <article
            className="dual-card dual-cost-card"
            aria-labelledby="dual-cost-title"
          >
            <div className="dual-result">
              <span className="dual-result-number">
                02 / {zh ? "容量成本" : "CAPACITY COST"}
              </span>
              <h2 id="dual-cost-title">
                <small>{zh ? "同时，仅需" : "Yet"}</small>1/{capacityRatio}
              </h2>
              <p>
                {zh ? "Redis 的值容量成本" : "of Redis value-capacity cost"}
              </p>
              <span className="dual-result-note">
                {zh ? "示意模型" : "Illustrative model"}
              </span>
            </div>
            <div className="dual-cost-chart">
              <p className="dual-chart-label">
                {zh
                  ? "成本示意 · Redis = 100%"
                  : "Illustrative cost · Redis = 100%"}
              </p>
              {rows.map((row) => {
                const lavik = row.name.startsWith("Lavik ");
                const percent = lavik
                  ? costPercent
                  : row.name.startsWith("Valkey ")
                    ? valkeyPercent
                    : 100;
                return (
                  <div className="dual-cost-row" key={row.name}>
                    <div>
                      <span>{row.name.split(" ")[0]}</span>
                      <strong>{percent}%</strong>
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <div
                        className={lavik ? "bar lavik-bar" : "bar"}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>

          <div className="dual-sources">
            <div
              className="dual-legend"
              aria-label={zh ? "图例" : "Chart legend"}
            >
              <span>
                <i />
                Lavik
              </span>
              <span>
                <i />
                Redis
              </span>
              <span>
                <i />
                Valkey
              </span>
            </div>
            <div className="dual-source-links">
              <a href={sourceUrl}>
                {zh ? "吞吐测试来源" : "Throughput benchmark"} ↗
              </a>
              <Link href={`/${locale}/cost/`}>
                {zh ? "容量成本模型" : "Capacity cost model"} ↗
              </Link>
              <a href="https://www.dragonflydb.io/">
                {zh
                  ? "Redis / Valkey 参考比例"
                  : "Redis / Valkey reference ratio"}{" "}
                ↗
              </a>
            </div>
            <p>
              {zh
                ? `示意假设：Valkey / Redis 比例参考 Dragonfly 主页的 400 / 500 GB；Lavik 按 DRAM / SSD 每 GiB 单价 ${capacityRatio}:1 估算为 Redis 基准的 ${costPercent}%。三者并非同条件实测，亦不代表部署总成本。`
                : `Illustrative assumptions: Valkey / Redis follows Dragonfly’s 400 / 500 GB example; Lavik uses a ${capacityRatio}:1 DRAM / SSD price per GiB, at ${costPercent}% of the Redis baseline. These are not same-workload measurements or total deployment costs.`}
            </p>
          </div>
        </div>
      </section>
      <details className="dual-method container">
        <summary>
          {zh ? "测试条件与适用范围" : "Test conditions & scope"}{" "}
          <span>SPDK · {benchmarkDate}</span>
        </summary>
        <p>{benchmarkScope}</p>
      </details>
    </main>
  );
}
