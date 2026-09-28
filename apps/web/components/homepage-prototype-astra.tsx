"use client";

// THROWAWAY: Astra's D/E/F alternatives on the existing locale homepage.
// Question: editorial proof, a storage manifesto, or an architecture story?
// Keep A/B/C intact; no design has been selected for production.
import Link from "next/link";
import type { Props } from "./homepage-prototype";
import { BenchmarkChart } from "./benchmark";
import "./homepage-prototype-astra.css";

function Start({ locale }: Pick<Props, "locale">) {
  return (
    <Link className="astra-start" href={`/${locale}/docs/0.1.0/quick-start/`}>
      {locale === "zh-CN" ? "开始使用 Lavik" : "Start with Lavik"}
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

function Notes({ locale, benchmarkDate, benchmarkScope, sourceUrl }: Props) {
  return (
    <aside className="astra-notes container">
      <span>SPDK / {benchmarkDate}</span>
      <p>
        {benchmarkScope}{" "}
        <a href={sourceUrl}>
          {locale === "zh-CN" ? "原始测试报告" : "Original benchmark report"} ↗
        </a>
      </p>
    </aside>
  );
}

function CostNote({
  locale,
  capacityRatio,
}: Pick<Props, "locale" | "capacityRatio">) {
  return (
    <p className="astra-cost-note">
      {locale === "zh-CN"
        ? `假设 DRAM / SSD 每 GiB 单价为 ${capacityRatio}:1，值容量成本降至 1/${capacityRatio}。索引内存、存储放大与服务器成本另计。`
        : `At a ${capacityRatio}:1 DRAM / SSD price per GiB, value capacity costs 1/${capacityRatio} as much. Index memory, storage amplification, and server costs are additional.`}
    </p>
  );
}

export function VariantD(props: Props) {
  const { locale, rows, capacityRatio, benchmarkDate } = props;
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="homepage-prototype prototype-d" data-variant="D">
      <section className="astra-d-edition container">
        <div className="astra-d-masthead">
          <span>LAVIK / {zh ? "性能新刊" : "THE PERFORMANCE EDITION"}</span>
          <span>SPDK · {benchmarkDate}</span>
        </div>
        <h1>
          {zh ? (
            <>
              SSD，<em>跑在前面。</em>
            </>
          ) : (
            <>
              SSD takes <em>the lead.</em>
            </>
          )}
        </h1>
        <div className="astra-d-deck">
          <p>
            {zh
              ? "Lavik 把值放在 NVMe SSD。在已发布的 SPDK 测试中，GET 与 SET 峰值吞吐量均超过内存 Redis / Valkey。"
              : "Values on NVMe SSD. Peak GET and SET throughput ahead of in-memory Redis / Valkey in published SPDK tests. This is Lavik."}
          </p>
          <Start locale={locale} />
        </div>
        <div className="astra-d-spread">
          <div className="astra-d-results">
            <div className="astra-d-section-label">
              <span>01 / {zh ? "速度，有据可查" : "THE RESULTS ARE IN"}</span>
              <span>SPDK / GET + SET</span>
            </div>
            <div className="astra-d-thesis">
              <span>
                {zh ? "你以为，需要全内存。" : "You expected all-memory."}
              </span>
              <strong>
                {zh ? "其实，值在 SSD。" : "The values are on SSD."}
              </strong>
              <p>
                {zh
                  ? "而 GET / SET 峰值吞吐，仍超过内存 Redis / Valkey。"
                  : "Yet peak GET / SET throughput exceeds in-memory Redis / Valkey."}
              </p>
              <small>
                {zh
                  ? "已发布 SPDK 测试中的系统吞吐结果"
                  : "System throughput in the published SPDK tests"}
              </small>
            </div>
            <details className="astra-proof">
              <summary>
                {zh
                  ? "展开精确吞吐数据"
                  : "Inspect the exact throughput figures"}
              </summary>
              <table>
                <thead>
                  <tr>
                    <th>{zh ? "数据引擎" : "Engine"}</th>
                    <th>GET</th>
                    <th>SET</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.name}>
                      <th scope="row">
                        <span className="astra-d-rank">0{index + 1}</span>
                        <span>
                          {row.name.split(" ")[0]}
                          <small>
                            {index === 0
                              ? "NVMe SSD / SPDK"
                              : zh
                                ? "内存 / DRAM"
                                : "IN-MEMORY / DRAM"}
                          </small>
                        </span>
                        {index === 0 && (
                          <span className="astra-d-arrow" aria-hidden="true">
                            ↗
                          </span>
                        )}
                      </th>
                      <td>{row.get.toLocaleString("en-US")}</td>
                      <td>{row.set.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            <Link className="astra-text-link" href={`/${locale}/benchmarks/`}>
              {zh
                ? "阅读测试方法与完整结果"
                : "Read the methodology & full results"}{" "}
              <span>↗</span>
            </Link>
          </div>
          <aside className="astra-d-margin">
            <span className="astra-eyebrow">
              02 / {zh ? "还有，容量成本" : "AND THE CAPACITY COST"}
            </span>
            <strong>
              {capacityRatio}
              <span>×</span>
            </strong>
            <h2>{zh ? "更低的值容量成本。" : "Lower value-capacity cost."}</h2>
            <p>
              {zh
                ? "让值容量按 SSD 的价格增长。"
                : "Grow your value capacity at SSD prices."}
            </p>
            <Link className="astra-text-link" href={`/${locale}/cost/`}>
              {zh ? "算一笔容量账" : "Do the capacity math"} ↗
            </Link>
            <CostNote {...props} />
          </aside>
        </div>
        <div className="astra-d-bottom">
          <span>
            {zh
              ? "换引擎，沿用熟悉的客户端。"
              : "A different engine. Your familiar clients."}
          </span>
          <span>
            Redis clients <b>·</b> RESP2 / RESP3 <b>·</b> Apache 2.0
          </span>
        </div>
      </section>
      <Notes {...props} />
    </main>
  );
}

export function VariantE(props: Props) {
  const { locale, capacityRatio } = props;
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="homepage-prototype prototype-e" data-variant="E">
      <section className="astra-e-poster container">
        <div className="astra-e-intro">
          <span className="astra-eyebrow">
            LAVIK /{" "}
            {zh ? "重新想象高性能存储" : "RETHINK HIGH-PERFORMANCE STORAGE"}
          </span>
          <span className="astra-e-open">
            ● {zh ? "开源 · NVMe 原生" : "OPEN SOURCE · NVMe NATIVE"}
          </span>
        </div>
        <h1>
          {zh ? (
            <>
              数据，放 SSD。
              <br />
              <em>吞吐，超内存。</em>
            </>
          ) : (
            <>
              Put it on SSD.
              <br />
              <em>Pull ahead.</em>
            </>
          )}
        </h1>
        <div className="astra-e-story">
          <p>
            {zh
              ? "Lavik 在已发布的 SPDK GET / SET 峰值吞吐测试中，超过了内存 Redis 和 Valkey。存储介质，不必定义性能上限。"
              : "Lavik outperforms in-memory Redis and Valkey in published SPDK peak GET / SET throughput. Rethink what SSD can do."}
          </p>
          <Start locale={locale} />
        </div>
        <div className="astra-e-runway">
          <div className="astra-e-medium">
            <span>01 / {zh ? "值存储" : "VALUE STORAGE"}</span>
            <strong>
              NVMe<span>SSD</span>
            </strong>
            <small>{zh ? "键索引留在内存" : "Key index stays in memory"}</small>
          </div>
          <div className="astra-e-path" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span>→</span>
          </div>
          <div className="astra-e-ticket">
            <span>SPDK / GET + SET</span>
            <h2>
              {zh ? (
                <>
                  值在 SSD。
                  <br />
                  吞吐超越
                  <br />
                  <em>内存引擎。</em>
                </>
              ) : (
                <>
                  SSD values.
                  <br />
                  Beyond
                  <br />
                  <em>in-memory.</em>
                </>
              )}
            </h2>
            <p>
              {zh
                ? "已发布峰值吞吐测试 · 对照 Redis / Valkey"
                : "Published peak throughput · versus Redis / Valkey"}
            </p>
            <Link href={`/${locale}/benchmarks/`}>
              {zh
                ? "查看精确数据与测试边界"
                : "See exact figures & test conditions"}{" "}
              ↗
            </Link>
          </div>
        </div>
        <div className="astra-e-comparison">
          <span>
            {zh
              ? "改变值存储介质，沿用熟悉的接口。"
              : "Change the value storage. Keep the familiar interface."}
          </span>
          <span>Redis clients</span>
          <span>RESP2 / RESP3</span>
        </div>
      </section>
      <section className="astra-e-capacity">
        <div className="container">
          <span className="astra-eyebrow">
            02 / {zh ? "速度之后，空间更从容" : "MORE ROOM AFTER THE SPEED"}
          </span>
          <h2>
            {zh ? (
              <>
                性能向前。
                <br />
                容量成本向下。
              </>
            ) : (
              <>
                Push performance.
                <br />
                Shrink capacity cost.
              </>
            )}
          </h2>
          <div className="astra-e-cost">
            <strong>1/{capacityRatio}</strong>
            <span>{zh ? "值容量成本" : "the value-capacity cost"}</span>
            <Link href={`/${locale}/cost/`}>
              {zh ? "查看容量成本模型" : "Explore the capacity model"} ↗
            </Link>
          </div>
          <CostNote {...props} />
        </div>
      </section>
      <Notes {...props} />
    </main>
  );
}

export function VariantF(props: Props) {
  const { locale, rows, capacityRatio } = props;
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="homepage-prototype prototype-f" data-variant="F">
      <section className="astra-f-hero container">
        <div className="astra-f-topline">
          <span className="astra-eyebrow">
            LAVIK /{" "}
            {zh ? "下一代 Redis 兼容引擎" : "THE NEXT REDIS-COMPATIBLE ENGINE"}
          </span>
          <span className="astra-f-status">SPDK + NVMe</span>
        </div>
        <div className="astra-f-heading">
          <h1>
            {zh ? (
              <>
                用 SSD。
                <br />
                <em>超越内存吞吐。</em>
              </>
            ) : (
              <>
                Choose SSD.
                <br />
                <em>Outrun memory.</em>
              </>
            )}
          </h1>
          <div>
            <p>
              {zh
                ? "在已发布的 SPDK 测试中，Lavik 的 GET / SET 峰值吞吐量超过内存 Redis 和 Valkey。值存储换了介质，性能有了新选择。"
                : "In published SPDK tests, Lavik exceeds in-memory Redis and Valkey in peak GET / SET throughput. Change where values live. Expand what is possible."}
            </p>
            <Start locale={locale} />
          </div>
        </div>
        <div className="astra-f-workspace">
          <aside className="astra-f-guide">
            <span className="astra-eyebrow">
              01 / {zh ? "重新分配存储" : "RETHINK THE STORAGE"}
            </span>
            <h2>
              {zh
                ? "让内存做索引。\n让 SSD 装下值。"
                : "Memory for keys.\nSSD for values."}
            </h2>
            <p>
              {zh
                ? "Lavik 的存储架构，将值容量从全内存的成本中解放出来。"
                : "Lavik separates value capacity from the economics of an all-memory engine."}
            </p>
            <Link className="astra-text-link" href={`/${locale}/benchmarks/`}>
              {zh ? "测试方法与限制" : "Methodology & limitations"} ↗
            </Link>
          </aside>
          <div className="astra-f-composition">
            <div className="astra-f-client">
              <span>{zh ? "熟悉的客户端" : "YOUR FAMILIAR CLIENTS"}</span>
              <strong>Redis / RESP</strong>
              <span aria-hidden="true">↓</span>
            </div>
            <div className="astra-f-storage">
              <div className="astra-f-memory">
                <span>{zh ? "键索引" : "KEY INDEX"}</span>
                <strong>DRAM</strong>
              </div>
              <div className="astra-f-ssd">
                <span>{zh ? "值存储" : "VALUE STORAGE"}</span>
                <strong>NVMe SSD</strong>
                <span>Lavik + SPDK</span>
              </div>
            </div>
            <p className="astra-f-outcome">
              <span>GET + SET</span>
              <strong>
                {zh
                  ? "峰值吞吐超过内存 Redis / Valkey"
                  : "Peak throughput ahead of in-memory Redis / Valkey"}
              </strong>
              <small>
                {zh ? "已发布 SPDK 测试结果" : "Published SPDK test results"}
              </small>
            </p>
          </div>
        </div>
        <details className="astra-proof astra-f-proof">
          <summary>
            {zh
              ? "查看实际 GET / SET 数据与 p99 延迟"
              : "Inspect actual GET / SET throughput and p99 latency"}
          </summary>
          <div className="astra-f-comparison">
            <BenchmarkChart rows={rows} locale={locale} />
          </div>
        </details>
        <section className="astra-f-payoff">
          <div>
            <span className="astra-eyebrow">
              02 /{" "}
              {zh
                ? "容量经济性，也一起改变"
                : "THE CAPACITY ECONOMICS CHANGE, TOO"}
            </span>
            <h2>
              {zh ? "性能有了，空间也有了。" : "Room to grow comes with it."}
            </h2>
          </div>
          <div className="astra-f-ratio">
            <strong>{capacityRatio}×</strong>
            <span>{zh ? "更低的值容量成本" : "lower value-capacity cost"}</span>
          </div>
          <Link className="astra-text-link" href={`/${locale}/cost/`}>
            {zh ? "计算容量成本" : "Model capacity cost"} ↗
          </Link>
          <CostNote {...props} />
        </section>
      </section>
      <Notes {...props} />
    </main>
  );
}
