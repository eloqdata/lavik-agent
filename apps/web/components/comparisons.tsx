import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import {
  comparisonProducts,
  comparisonRoute,
  type ComparisonProduct,
} from "../../../packages/comparisons/catalog";
import {
  comparisonCopy,
  comparisonFaq,
} from "../../../packages/comparisons/content";
import {
  bestPoint,
  comparisonMeasurements,
  comparisonSource,
  type Measurement,
} from "../../../packages/comparisons/measurements";
import { assertComparisonPublication } from "../../../packages/comparisons/gate";
import { ComparisonCost } from "./comparison-cost";
import { rawArchiveUrl } from "../../../packages/benchmarks/raw-data";
const n = (v: number) => Math.round(v).toLocaleString("en-US");
const qps = (p: Measurement) => n(p.qps);
function Start({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <div className="comparison-actions">
      <Link
        className="button primary"
        href={`/${locale}/docs/0.1.0/quick-start/`}
      >
        {zh ? "开始使用 Lavik 0.1.0" : "Start with Lavik 0.1.0"} →
      </Link>
      <Link href={`/${locale}/docs/0.1.0/migrate-redis/`}>
        {zh ? "使用 RedisShake 迁移" : "Migrate with RedisShake"} →
      </Link>
    </div>
  );
}
function Approach({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <section className="comparison-section" id="architecture">
      <p className="eyebrow">LAVIK 0.1.0</p>
      <h2>
        {zh
          ? "应用继续使用 Redis，容量转向 NVMe SSD。"
          : "Keep the Redis interface. Move value capacity to NVMe SSD."}
      </h2>
      <p>
        {zh
          ? "Lavik 将紧凑键索引留在 DRAM，值数据存于 NVMe SSD。工作线程拥有本地状态，协程与异步 I/O 重叠执行请求。0.1.0 还为大字符串和集合提供分组存储，让局部读取和更新聚焦相关数据。"
          : "Lavik keeps a compact key index in DRAM and values on NVMe SSD. Worker-owned state, coroutines and asynchronous I/O keep requests moving while storage operations complete. Version 0.1.0 adds grouped storage for large strings and collections, so partial reads and updates can focus on the relevant data."}
      </p>
      <div className="comparison-flow">
        {(zh
          ? ["Redis 客户端 / RESP", "内存键索引", "异步 I/O", "NVMe SSD 值存储"]
          : [
              "Redis client / RESP",
              "DRAM key index",
              "Asynchronous I/O",
              "NVMe SSD values",
            ]
        ).map((s, i) => (
          <div key={s}>
            <span>0{i + 1}</span>
            <strong>{s}</strong>
          </div>
        ))}
      </div>
      <p>
        <Link href={`/${locale}/docs/0.1.0/storage/`}>
          {zh ? "了解存储设计" : "Explore the storage design"} →
        </Link>
      </p>
    </section>
  );
}
export function CompareHome({ locale }: { locale: Locale }) {
  assertComparisonPublication();
  const zh = locale === "zh-CN";
  return (
    <main className="container comparison-page">
      <header className="comparison-hero">
        <p className="eyebrow">{zh ? "选择 LAVIK" : "WHY LAVIK"}</p>
        <h1>
          {zh
            ? "更大的数据集。更少的内存账单。"
            : "More data. Less spent on memory."}
        </h1>
        <p className="comparison-lead">
          {zh
            ? "Lavik 0.1.0 在 NVMe SSD 上实现超越内存 Redis 与 Valkey 的峰值吞吐量。对比你正在使用的数据库，看看容量、读取延迟和每节点吞吐量如何改变部署成本。"
            : "Lavik 0.1.0 delivers higher peak throughput on NVMe SSD than the tested Redis and Valkey configurations in DRAM. Compare your current database and see how capacity, read latency and throughput per node change the cost of serving your data."}
        </p>
        <Start locale={locale} />
      </header>
      <section id="products" className="comparison-section">
        <h2>
          {zh ? "从你的现有数据库开始" : "Start with the database you use"}
        </h2>
        <div className="comparison-grid">
          {comparisonProducts.map((p) => {
            const c = comparisonCopy[p.id],
              d = comparisonMeasurements(p),
              a = bestPoint(d.lavik, "GET"),
              b = bestPoint(d.peer, "GET");
            return (
              <Link
                className="comparison-card"
                href={`/${locale}/${comparisonRoute(p.id)}/`}
                key={p.id}
              >
                <p className="comparison-label">
                  {p.group === "memory"
                    ? zh
                      ? "内存数据库"
                      : "IN-MEMORY DATABASE"
                    : p.group === "storage"
                      ? zh
                        ? "SSD 数据库"
                        : "SSD-BACKED DATABASE"
                      : zh
                        ? "架构与容量"
                        : "ARCHITECTURE & CAPACITY"}
                </p>
                <h3>
                  Lavik vs {p.name} <span aria-hidden="true">↗</span>
                </h3>
                <p>{c.angle[locale]}</p>
                {a && b ? (
                  <>
                    <strong className="comparison-card-stat">
                      {b.approximate ? "≈ " : ""}
                      {(a.qps / b.qps).toFixed(2)}×{" "}
                      <span>{zh ? "GET 吞吐量" : "GET throughput"}</span>
                    </strong>
                    <p className="comparison-small">
                      {p.group === "memory"
                        ? zh
                          ? "1,000 万键 · 1,280 连接 · 原始实测结果"
                          : "10M keys · 1,280 connections · raw measurements"
                        : zh
                          ? "十亿键 · 同为 80 个连接"
                          : "1B keys · same 80 connections"}
                    </p>
                  </>
                ) : (
                  <p className="comparison-small">
                    {zh
                      ? "NVMe 存储、大对象设计与迁移步骤"
                      : "NVMe storage, large-object design and migration"}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>
      <Approach locale={locale} />
      <section className="comparison-section">
        <h2>
          {zh
            ? "性能与成本，用当前发布版说明。"
            : "Performance and cost, grounded in the current release."}
        </h2>
        <p>
          {zh
            ? "10 月报告使用 Lavik 0.1.0，覆盖小型实例、16 vCPU 内存数据库对照、十亿键 SSD 数据库及 Aerospike。按 20:1 的 DRAM/SSD 每 GiB 单价计算，值容量介质成本降低 95%；完整部署再计入 CPU、索引内存与副本。"
            : "The October reports use Lavik 0.1.0 across compact instances, 16-vCPU DRAM comparisons, billion-key SSD databases and Aerospike. At a 20:1 DRAM/SSD price per GiB, value-capacity media cost falls by 95%; include CPU, index memory and replicas when sizing the complete deployment."}
        </p>
        <Link href={`/${locale}/benchmarks/`}>
          {zh
            ? "查看所有 0.1.0 基准与复现步骤"
            : "See all 0.1.0 benchmarks and reproduction steps"}{" "}
          →
        </Link>
      </section>
    </main>
  );
}
export function ComparisonPage({
  locale,
  product: p,
}: {
  locale: Locale;
  product: ComparisonProduct;
}) {
  assertComparisonPublication();
  const zh = locale === "zh-CN",
    c = comparisonCopy[p.id],
    data = comparisonMeasurements(p),
    get = bestPoint(data.lavik, "GET"),
    peer = bestPoint(data.peer, "GET"),
    memory = p.group === "memory",
    measured = !!get && !!peer;
  const route = memory ? "redis-valkey" : "1tb-storage";
  return (
    <main className="container comparison-page">
      <header className="comparison-hero">
        <Link className="comparison-back" href={`/${locale}/compare/`}>
          ← {zh ? "全部产品对比" : "All comparisons"}
        </Link>
        <p className="eyebrow">LAVIK 0.1.0</p>
        <h1>Lavik vs {p.name}</h1>
        <p className="comparison-headline">{c.angle[locale]}</p>
        <p className="comparison-lead">{c.summary[locale]}</p>
        <Start locale={locale} />
      </header>
      <nav
        className="comparison-toc"
        aria-label={zh ? "本页内容" : "On this page"}
      >
        {[
          ["performance", zh ? "性能" : "Performance"],
          ["design", zh ? "存储设计" : "Storage design"],
          ["cost", zh ? "成本" : "Cost"],
          ["migration", zh ? "迁移" : "Migration"],
          ["faq", "FAQ"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <section id="performance" className="comparison-section">
        <p className="eyebrow">
          {measured
            ? memory
              ? "OCTOBER 13, 2026"
              : "OCTOBER 14, 2026"
            : "LAVIK 0.1.0"}
        </p>
        <h2>
          {zh
            ? "让容量增长，同时保持快速读取。"
            : "Grow the dataset. Keep reads fast."}
        </h2>
        {measured ? (
          <>
            <div className="comparison-metrics">
              <div>
                <strong>
                  {peer.approximate ? "≈ " : ""}
                  {(get.qps / peer.qps).toFixed(2)}×
                </strong>
                <span>{zh ? "GET 吞吐量" : "GET throughput"}</span>
              </div>
              <div>
                <strong>{qps(get)}</strong>
                <span>Lavik GET QPS</span>
              </div>
              <div>
                <strong>{get.p999.toFixed(3)} ms</strong>
                <span>Lavik GET p99.9</span>
              </div>
            </div>
            <p>{c.consequence[locale]}</p>
            <div
              className="comparison-table-scroll"
              role="region"
              aria-label={
                zh ? "可横向滚动的性能表" : "Scrollable performance table"
              }
              tabIndex={0}
            >
              <table>
                <caption>
                  {memory
                    ? zh
                      ? "1,000 万键 · 1,280 个连接 · 1 KiB 值"
                      : "10M keys · 1,280 connections · 1 KiB values"
                    : zh
                      ? "十亿键 · 同为 80 个连接 · 1 KiB 值"
                      : "1B keys · same 80 connections · 1 KiB values"}
                </caption>
                <thead>
                  <tr>
                    <th>{zh ? "操作" : "Operation"}</th>
                    <th>{zh ? "系统" : "System"}</th>
                    <th>QPS</th>
                    <th>p99.9 (ms)</th>
                    <th>{zh ? "连接数" : "Connections"}</th>
                  </tr>
                </thead>
                <tbody>
                  {(["GET", "SET"] as const)
                    .flatMap((op) => [
                      bestPoint(data.lavik, op)!,
                      bestPoint(data.peer, op)!,
                    ])
                    .map((row) => (
                      <tr
                        key={row.system + row.workload}
                        className={
                          row.system.startsWith("Lavik")
                            ? "lavik-row"
                            : undefined
                        }
                      >
                        <th scope="row">{row.workload}</th>
                        <td>{row.system}</td>
                        <td>{qps(row)}</td>
                        <td>
                          {row.approximate ? "≈ " : ""}
                          {row.p999.toFixed(row.approximate ? 1 : 3)}
                        </td>
                        <td>{n(row.connections)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="comparison-small">
              {memory
                ? zh
                  ? "数值来自原始测量结果；QPS 四舍五入为整数，p99.9 保留三位小数。"
                  : "Values come from raw measurements; QPS is rounded to whole operations and p99.9 retains three decimal places."
                : zh
                  ? "同连接数比较；完整报告还展示 80–1,280 连接的吞吐量与尾延迟曲线。"
                  : "Matched-concurrency comparison. The full report also plots throughput and tail latency across 80–1,280 connections."}
            </p>
            <details className="comparison-sweep">
              <summary>
                {zh ? "测试方法与完整结果" : "Test method and full results"}
              </summary>
              <p>{c.nuance[locale]}</p>
              <p>
                <a
                  href={rawArchiveUrl(
                    memory
                      ? "lavik-v0.1.0-spdk-vs-latest-2026-10-13"
                      : "lavik-v0.1.0-storage-peers-1tb-2026-10-14",
                  )}
                >
                  {zh ? "原始测量数据与校验和" : "Raw measurements & checksums"}{" "}
                  ↗
                </a>
              </p>
              <p>
                {zh
                  ? "结果来自单机单次测试，缓存、预热与持久化设置按报告执行。节点模型假设均衡分片与可线性扩展的吞吐量；上线前应按实际负载和故障场景确定余量。"
                  : "Results are single-server observations with the report’s cache, warmup and persistence settings. Node calculations assume balanced sharding and reusable per-node throughput; set production headroom from your workload and failure tests."}
              </p>
              <Link href={`/${locale}/benchmarks/${route}/`}>
                {zh
                  ? "图表、配置与完整复现步骤"
                  : "Charts, configurations and full reproduction steps"}{" "}
                →
              </Link>
            </details>
          </>
        ) : (
          <>
            <p>{c.consequence[locale]}</p>
            <p className="comparison-small">{c.nuance[locale]}</p>
            <Link href={`/${locale}/benchmarks/`}>
              {zh
                ? "查看 Lavik 0.1.0 实测结果"
                : "Explore measured Lavik 0.1.0 results"}{" "}
              →
            </Link>
          </>
        )}
      </section>
      <section className="comparison-section" id="design">
        <h2>
          {zh ? "存储设计如何改变使用体验" : "What the storage design changes"}
        </h2>
        <p>{c.design[locale]}</p>
        <p>{c.choose[locale]}</p>
        <Link href={`/${locale}/docs/0.1.0/storage/`}>
          {zh
            ? "Lavik 存储与大对象设计"
            : "Lavik storage and large-object design"}{" "}
          →
        </Link>
      </section>
      <section className="comparison-section" id="cost">
        <h2>
          {memory
            ? zh
              ? "让容量按 SSD 的价格增长"
              : "Grow capacity at SSD prices"
            : zh
              ? "为目标负载规划更少的节点"
              : "Plan fewer nodes for the workload"}
        </h2>
        <p>
          {memory
            ? zh
              ? "先看相同值容量的介质成本，再把索引内存、复制和服务器计入预算。调整价格，查看你的数据规模意味着多少支出。"
              : "Start with the media cost of the same value capacity, then budget for index memory, replication and servers. Adjust the prices to see what your dataset costs."
            : zh
              ? "单节点处理更多请求，有机会减少服务相同数据集所需的节点。用你的目标 QPS、容量、副本数与节点价格计算。"
              : "More requests per primary can mean fewer nodes serving the same dataset. Calculate with your target QPS, capacity, replicas and node prices."}
        </p>
        {measured ? (
          <ComparisonCost
            locale={locale}
            peer={p.name}
            memory={memory}
            points={data}
          />
        ) : (
          <div className="comparison-result">
            <p>{c.answer[locale]}</p>
            <Link href={`/${locale}/cost/`}>
              {zh ? "打开容量成本计算器" : "Open the capacity-cost calculator"}{" "}
              →
            </Link>
          </div>
        )}
      </section>
      <section className="comparison-section" id="migration">
        <h2>
          {zh ? "从一个数据集开始迁移" : "Start the migration with one dataset"}
        </h2>
        <p>{c.retain[locale]}</p>
        {p.id !== "redis" && (
          <p>
            {zh
              ? "迁移指南提供 Redis 与 Redis Cluster 的已记录流程。从其他 Redis 兼容产品迁移时，先确认其 RDB 与复制协议能被 RedisShake 读取，再进行全量和增量同步演练。"
              : "The migration guide documents Redis and Redis Cluster sources. For another Redis-compatible product, confirm that RedisShake can read its RDB and replication stream before rehearsing full and incremental synchronization."}
          </p>
        )}
        <ol>
          <li>
            <Link href={`/${locale}/docs/0.1.0/quick-start/`}>
              {zh ? "安装并启动 Lavik 0.1.0" : "Install and start Lavik 0.1.0"}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/docs/0.1.0/clients/`}>
              {zh ? "连接你的客户端" : "Connect your client"}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/docs/0.1.0/migrate-redis/`}>
              {zh
                ? "使用 RedisShake 查看 RedisShake 的源端要求与切流步骤"
                : "Check RedisShake source requirements and cutover steps"}
            </Link>
          </li>
        </ol>
      </section>
      <section className="comparison-section" id="faq">
        <h2>{zh ? "常见问题" : "Questions before you start"}</h2>
        {comparisonFaq(p.id, locale).map((f) => (
          <details key={f.question}>
            <summary>{f.question}</summary>
            <p>{f.answer}</p>
          </details>
        ))}
      </section>
      <details className="comparison-section" id="sources">
        <summary>
          {zh ? "参考资料与测试配置" : "References and test configurations"}
        </summary>
        <ul>
          {c.sources.map((id) => (
            <li key={id}>
              <a href={comparisonSource(id).url}>
                {id.startsWith("stable-")
                  ? zh
                    ? "Lavik 0.1.0 资料"
                    : "Lavik 0.1.0 source"
                  : p.name + " documentation"}{" "}
                ↗
              </a>
            </li>
          ))}
        </ul>
      </details>
      <Start locale={locale} />
    </main>
  );
}
