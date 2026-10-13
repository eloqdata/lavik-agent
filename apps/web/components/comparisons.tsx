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
  comparisonSources,
} from "../../../packages/comparisons/measurements";
import { assertComparisonPublication } from "../../../packages/comparisons/gate";
import { ComparisonCost } from "./comparison-cost";
const number = (n: number) => Math.round(n).toLocaleString("en-US");
function SourceLink({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return <a href={comparisonSource(id).url}>{children} ↗</a>;
}
function Approach({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <section className="comparison-section" id="architecture">
      <p className="eyebrow">
        {zh
          ? "熟悉的协议，面向 NVMe SSD 的执行路径"
          : "FAMILIAR PROTOCOL. NVMe SSD EXECUTION."}
      </p>
      <h2>
        {zh
          ? "速度来自架构，而不是要求应用换一种协议。"
          : "The architecture changes. Your application protocol stays familiar."}
      </h2>
      <p>
        {zh
          ? "Lavik 是 Apache 2.0 开源的 Redis 兼容键值存储。内存保存键索引，NVMe SSD 承载值数据。线程本地状态、协程与异步 I/O 让工作线程在等待存储时继续处理其他请求；SPDK 提供直接访问 NVMe 的存储路径。九月的 SPDK 测试仍使用内核 TCP，并未使用 DPDK 网络。"
          : "Lavik is an Apache 2.0 open-source, Redis-compatible key-value store. Memory holds the key index; NVMe SSD holds value data. Worker-local state, coroutines and asynchronous I/O let workers advance other requests while storage completes. SPDK provides a direct NVMe storage path. The September SPDK experiment still uses kernel TCP, not DPDK networking."}
      </p>
      <div
        className="comparison-flow"
        aria-label={zh ? "Lavik 请求路径" : "Lavik request path"}
      >
        {(zh
          ? [
              "Redis 客户端 / RESP",
              "工作线程与内存键索引",
              "异步 I/O",
              "NVMe SSD 值存储",
            ]
          : [
              "Redis client / RESP",
              "Worker + DRAM key index",
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
        {zh
          ? "存储引擎覆盖字符串、哈希、列表、集合与有序集合载荷；集合可使用分组存储。键索引、路由元数据和缓冲区仍消耗内存。字符串 GET/SET 基准并不证明其他数据结构具有相同 QPS。"
          : "The storage engine covers string, hash, list, set and sorted-set payloads, including grouped collection storage. Key indexes, routing metadata and buffers still consume RAM. String GET/SET benchmarks do not establish the same QPS for other data structures."}{" "}
        <SourceLink id="lavik-beta-overview">
          {zh ? "beta.1 架构" : "beta.1 architecture"}
        </SourceLink>{" "}
        ·{" "}
        <SourceLink id="lavik-beta-storage">
          {zh ? "存储与集合" : "Storage and collections"}
        </SourceLink>{" "}
        · <SourceLink id="lavik-license">Apache 2.0</SourceLink>
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
        <p className="eyebrow">{zh ? "产品对比" : "COMPARE LAVIK"}</p>
        <h1>
          {zh
            ? "SSD 的容量成本。超越 DRAM 对照组的实测吞吐量。"
            : "SSD capacity economics. Throughput beyond the DRAM controls."}
        </h1>
        <p className="comparison-lead">
          {zh
            ? "九月 SPDK 测试中，Lavik 在 NVMe SSD 上的 GET 与 SET 峰值 QPS 均高于 DRAM 中的 Redis 和 Valkey。逐一比较存储架构、尾延迟与成本，找到适合实际工作负载的选择。"
            : "In the September SPDK test, Lavik on NVMe SSD records higher peak GET and SET QPS than Redis and Valkey in DRAM. Compare storage design, tail latency and cost for the workload you actually run."}
        </p>
        <p>
          {zh
            ? "以 20:1 的 DRAM/SSD 容量单价比计算，值容量成本可降至 1/20。SSD 同类产品则需进一步比较每节点能提供多少吞吐量。"
            : "At a 20:1 DRAM/SSD unit-capacity price ratio, value-capacity cost falls to one twentieth. Against other SSD-backed products, the next question is how much throughput each node can deliver."}{" "}
          <SourceLink id="beta-report">
            {zh ? "完整九月报告" : "Full September report"}
          </SourceLink>
        </p>
        <div className="comparison-actions">
          <Link className="button primary" href={`/${locale}/download/`}>
            {zh ? "下载 Lavik" : "Download Lavik"} ↗
          </Link>
          <Link href="#products">
            {zh ? "选择对比产品" : "Choose a comparison"} ↓
          </Link>
        </div>
      </header>
      <section id="products" className="comparison-section">
        <h2>
          {zh ? "按你的现有技术栈比较" : "Compare with your current stack"}
        </h2>
        <div className="comparison-grid">
          {comparisonProducts.map((p) => {
            const copy = comparisonCopy[p.id],
              data = comparisonMeasurements(p),
              a = bestPoint(data.lavik, "GET")!,
              b = bestPoint(data.peer, "GET")!;
            return (
              <Link
                className="comparison-card"
                href={`/${locale}/${comparisonRoute(p.id)}/`}
                key={p.id}
              >
                <p className="comparison-label">
                  {p.group === "memory"
                    ? zh
                      ? "九月 · DRAM 对照"
                      : "SEPTEMBER · DRAM CONTROL"
                    : p.group === "storage"
                      ? zh
                        ? "九月 · 十亿键"
                        : "SEPTEMBER · BILLION KEYS"
                      : zh
                        ? "八月 · 历史磁盘测试"
                        : "AUGUST · HISTORICAL DISK TEST"}
                </p>
                <h3>
                  Lavik vs {p.name} <span aria-hidden="true">↗</span>
                </h3>
                <p>{copy.angle[locale]}</p>
                <strong className="comparison-card-stat">
                  {(a.qps / b.qps).toFixed(2)}×{" "}
                  <span>{zh ? "GET 吞吐量" : "GET throughput"}</span>
                </strong>
                <p className="comparison-small">
                  {p.group === "historical"
                    ? zh
                      ? "相同 80 个连接，200M 键；历史 Lavik 构建。"
                      : "Same 80 connections, 200M keys; historical Lavik build."
                    : zh
                      ? "各自峰值点；不代表所有负载或 SLA。"
                      : "At each system’s peak; not all workloads or SLAs."}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
      <Approach locale={locale} />
      <section className="comparison-section">
        <h2>
          {zh
            ? "比较实验，不混合不同实验的数字"
            : "Compare experiments without mixing their numbers"}
        </h2>
        <div className="comparison-grid three">
          <div>
            <h3>
              {zh ? "10M 键 · Redis / Valkey" : "10M keys · Redis / Valkey"}
            </h3>
            <p>
              {zh
                ? "九月 18 日：1 KiB 值、30 秒窗口。比较 Lavik beta.1 SPDK 与内存对照组。持久化配置与峰值连接数不同。"
                : "September 18: 1 KiB values, 30-second windows. Lavik beta.1 SPDK versus in-memory controls. Persistence settings and peak connection counts differ."}
            </p>
          </div>
          <div>
            <h3>
              {zh
                ? "1B 键 · Dragonfly / Garnet"
                : "1B keys · Dragonfly / Garnet"}
            </h3>
            <p>
              {zh
                ? "九月 18 日：1 KiB 值、60 秒窗口、六块 NVMe。查看全部连接数测量点和 p99 条件，不把峰值等同于 SLA。"
                : "September 18: 1 KiB values, 60-second windows, six NVMe devices. Inspect all connection points and p99 conditions; peak throughput is not an SLA."}
            </p>
          </div>
          <div>
            <h3>
              {zh ? "200M 键 · 磁盘同类产品" : "200M keys · Disk-backed peers"}
            </h3>
            <p>
              {zh
                ? "八月 11–12 日：1,000–4,000 字节值、300 秒窗口、80 个连接、两块 NVMe。这是历史构建结果，并非 beta.1 重新测试。"
                : "August 11–12: 1,000–4,000-byte values, 300-second windows, 80 connections, two NVMe devices. Historical builds, not a beta.1 retest."}
            </p>
          </div>
        </div>
        <p>
          <SourceLink id="beta-report">
            {zh ? "九月方法与原始数据" : "September method and raw data"}
          </SourceLink>{" "}
          ·{" "}
          <SourceLink id="tiering-report">
            {zh ? "八月方法与原始数据" : "August method and raw data"}
          </SourceLink>
        </p>
      </section>
    </main>
  );
}
export function ComparisonPage({
  locale,
  product,
}: {
  locale: Locale;
  product: ComparisonProduct;
}) {
  assertComparisonPublication();
  const zh = locale === "zh-CN",
    copy = comparisonCopy[product.id],
    data = comparisonMeasurements(product),
    historical = product.group === "historical",
    get = bestPoint(data.lavik, "GET")!,
    peerGet = bestPoint(data.peer, "GET")!,
    report = historical ? "tiering-report" : "beta-report";
  const lavikName = historical
    ? "Lavik SPDK · August build"
    : "Lavik 0.1.0-beta.1 SPDK";
  const workloads = (historical ? ["GET", "SET", "MIX"] : ["GET", "SET"]) as (
    "GET" | "SET" | "MIX"
  )[];
  return (
    <main className="container comparison-page">
      <header className="comparison-hero">
        <Link href={`/${locale}/compare/`} className="comparison-back">
          ← {zh ? "全部对比" : "All comparisons"}
        </Link>
        <p className="eyebrow">
          {zh ? "性能 · 架构 · 成本" : "PERFORMANCE · ARCHITECTURE · COST"}
        </p>
        <h1>Lavik vs {product.name}</h1>
        <p className="comparison-headline">{copy.angle[locale]}</p>
        <p className="comparison-lead">{copy.summary[locale]}</p>
        <p className="comparison-small">
          {zh
            ? "Lavik 项目团队 · 资料核对"
            : "By the Lavik project · Sources checked"}
          : {comparisonSources.checkedAt} · {copy.tested}
        </p>
        <div className="comparison-actions">
          <Link className="button primary" href={`/${locale}/download/`}>
            {zh ? "试用 Lavik" : "Try Lavik"} ↗
          </Link>
          <a href="#performance">{zh ? "查看基准" : "Inspect benchmarks"} ↓</a>
        </div>
      </header>
      <nav
        className="comparison-toc"
        aria-label={zh ? "本页内容" : "On this page"}
      >
        {[
          ["performance", zh ? "性能" : "Performance"],
          ["design", zh ? "存储设计" : "Storage design"],
          ["cost", zh ? "成本" : "Cost"],
          ["decision", zh ? "如何选择" : "Choosing"],
          ["faq", "FAQ"],
          ["sources", zh ? "来源" : "Sources"],
        ].map(([id, title]) => (
          <a key={id} href={`#${id}`}>
            {title}
          </a>
        ))}
      </nav>
      <section className="comparison-section" id="performance">
        <p className="eyebrow">
          {historical
            ? zh
              ? "2026 年 8 月 · 历史实验"
              : "AUGUST 2026 · HISTORICAL EXPERIMENT"
            : zh
              ? "2026 年 9 月 18 日 · beta.1"
              : "SEPTEMBER 18, 2026 · BETA.1"}
        </p>
        <h2>
          {zh
            ? "让真实测量说明性能"
            : "Performance, with the measurements attached"}
        </h2>
        <div className="comparison-metrics">
          <div>
            <strong>{(get.qps / peerGet.qps).toFixed(2)}×</strong>
            <span>{zh ? "Lavik / 对照 GET QPS" : "Lavik / peer GET QPS"}</span>
          </div>
          <div>
            <strong>{get.p99.toFixed(3)} ms</strong>
            <span>
              {zh ? "Lavik 在该 GET 点的 p99" : "Lavik p99 at that GET point"}
            </span>
          </div>
          <div>
            <strong>{peerGet.p99.toFixed(3)} ms</strong>
            <span>
              {zh ? "对照在该 GET 点的 p99" : "Peer p99 at that GET point"}
            </span>
          </div>
        </div>
        <p>
          {historical
            ? zh
              ? "200M 键，值长度均匀分布在 1,000–4,000 字节；相同 Azure Standard_L16s_v3 服务器及客户端、两块 NVMe、80 个连接、300 秒窗口。按 GET → 1:1 混合 → SET 顺序运行，无中途重载；维护策略与持久化配置不同。表中不包含使用不同环境的 Azure Managed Redis 行。Lavik 为八月历史构建，不是 beta.1。"
              : "200M keys with uniformly distributed 1,000–4,000-byte values; the same Azure Standard_L16s_v3 server/client setup, two NVMe devices, 80 connections and 300-second windows. Runs proceed GET → 1:1 mixed → SET without reloading; maintenance and persistence settings differ. Azure Managed Redis rows from a different environment are excluded. Lavik is the historical August build, not beta.1."
            : zh
              ? `${product.group === "memory" ? "10M" : "1B"} 键 × 1 KiB 值；AMD EPYC 9V74，约 126 GiB RAM，六块 NVMe，16 个逻辑 CPU 亲和性，pipeline=1。每点测量一次，窗口 ${product.group === "memory" ? "30" : "60"} 秒。对照数据来自相同主机较早的扫描；beta.1 SPDK 点为新测。每种操作分别选择各系统最高 QPS 点，连接数可能不同。`
              : `${product.group === "memory" ? "10M" : "1B"} keys × 1 KiB values; AMD EPYC 9V74, approximately 126 GiB RAM, six NVMe devices, 16-logical-CPU affinity, pipeline=1. Each point measured once for ${product.group === "memory" ? "30" : "60"} seconds. Peer controls come from an earlier sweep on the same hosts; beta.1 SPDK points are newly measured. Each operation selects each system's highest-QPS point; connection counts can differ.`}{" "}
          <SourceLink id={report}>
            {zh ? "方法与完整报告" : "Method and full report"}
          </SourceLink>
        </p>
        <div className="comparison-chart" aria-hidden="true">
          <h3>
            {zh
              ? "GET 吞吐量（QPS，零起点）"
              : "GET throughput (QPS, zero baseline)"}
          </h3>
          {[
            ["Lavik SPDK", get.qps],
            [product.name, peerGet.qps],
          ].map(([label, qps], i) => (
            <div className="comparison-bar-row" key={label}>
              <span>{label}</span>
              <div>
                <i
                  className={i ? "peer" : ""}
                  style={{
                    width: `${(Number(qps) / Math.max(get.qps, peerGet.qps)) * 100}%`,
                  }}
                />
              </div>
              <strong>{number(Number(qps))}</strong>
            </div>
          ))}
        </div>
        <div
          className="comparison-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={
            zh ? "可横向滚动的性能表" : "Scrollable performance table"
          }
        >
          <table>
            <caption>
              {historical
                ? zh
                  ? "固定 80 连接的实测结果"
                  : "Measured results at 80 connections"
                : zh
                  ? "各操作峰值 QPS 及该点的延迟"
                  : "Peak QPS per operation and latency at that point"}
            </caption>
            <thead>
              <tr>
                {[
                  zh ? "操作" : "Workload",
                  zh ? "系统" : "System",
                  "QPS",
                  "p99 (ms)",
                  "p99.9 (ms)",
                  zh ? "连接数" : "Connections",
                ].map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {workloads.flatMap((w) =>
                [data.lavik, data.peer].map((rows, i) => {
                  const p = bestPoint(rows, w)!;
                  return (
                    <tr key={`${w}-${i}`} className={i ? "" : "lavik-row"}>
                      <th scope="row">{w === "MIX" ? "GET:SET 1:1" : w}</th>
                      <td>{i ? copy.tested : lavikName}</td>
                      <td>{number(p.qps)}</td>
                      <td>{p.p99.toFixed(3)}</td>
                      <td>{p.p999.toFixed(3)}</td>
                      <td>{p.connections}</td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>
        <div className="comparison-note">
          <h3>
            {zh
              ? "读懂这个结果"
              : "What this result does—and does not—establish"}
          </h3>
          <p>{copy.nuance[locale]}</p>
          <p>
            {zh
              ? "这是 Lavik 项目发布的基准，尚非第三方复测。单机短窗口结果不能证明相同崩溃持久性、长期稳定状态、集群容量或应用 SLA。使用下方成本模型前，请对照你的负载、数据分布与延迟预算。"
              : "These are Lavik-published benchmarks, not an independent reproduction. Short single-server windows do not establish equal crash durability, long-term steady state, cluster capacity or an application SLA. Match your workload, data distribution and latency budget before using the cost model."}
          </p>
        </div>
        {!historical && (
          <details className="comparison-sweep">
            <summary>
              {zh
                ? "查看完整连接数与线程扫描"
                : "Inspect the full connection and thread sweep"}
            </summary>
            <div
              className="comparison-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={
                zh
                  ? "可横向滚动的完整测量表"
                  : "Scrollable full measurement table"
              }
            >
              <table>
                <caption>
                  {zh
                    ? "成本计算器可选择的全部测量点"
                    : "All measured points available to the cost calculator"}
                </caption>
                <thead>
                  <tr>
                    {[
                      zh ? "系统" : "System",
                      zh ? "操作" : "Workload",
                      zh ? "线程*" : "Threads*",
                      zh ? "连接" : "Connections",
                      "QPS",
                      "p99 (ms)",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[data.lavik, data.peer].flatMap((rows, i) =>
                    rows.map((p, n) => (
                      <tr key={`${i}-${n}`}>
                        <td>{i ? product.name : "Lavik"}</td>
                        <td>{p.workload}</td>
                        <td>{p.threads}</td>
                        <td>{p.connections}</td>
                        <td>{number(p.qps)}</td>
                        <td>{p.p99.toFixed(3)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <p>
              {zh
                ? "*线程角色不同：Lavik 工作线程、Redis/Valkey I/O 线程、Dragonfly proactor、Garnet 最小线程池线程。"
                : "*Thread roles differ: Lavik workers, Redis/Valkey I/O threads, Dragonfly proactors, and Garnet minimum thread-pool threads."}{" "}
              <SourceLink id="beta-results">CSV</SourceLink>
            </p>
          </details>
        )}
      </section>
      <section className="comparison-section" id="design">
        <h2>
          {zh
            ? "存储设计如何影响你的应用"
            : "How the storage design affects your application"}
        </h2>
        <p>{copy.design[locale]}</p>
        <p>{copy.consequence[locale]}</p>
        <p>
          {copy.sources
            .filter(
              (s) =>
                !["beta-report", "beta-results", "tiering-report"].includes(s),
            )
            .map((s, i) => (
              <span key={s}>
                {i ? " · " : ""}
                <SourceLink id={s}>{sourceLabel(s, zh)}</SourceLink>
              </span>
            ))}
        </p>
      </section>
      <Approach locale={locale} />
      <section className="comparison-section" id="cost">
        <h2>
          {product.group === "memory"
            ? zh
              ? "容量增长，不必按 DRAM 单价买单"
              : "Growing capacity need not carry a DRAM price tag"
            : zh
              ? "SSD 单价相同，节点数量仍可能不同"
              : "Same SSD prices can still mean different node counts"}
        </h2>
        <ComparisonCost
          locale={locale}
          peer={product.name}
          memory={product.group === "memory"}
          points={data}
        />
        {product.group === "memory" && (
          <Link href={`/${locale}/cost/`}>
            {zh
              ? "加入索引内存与共同成本"
              : "Include index memory and shared costs"}{" "}
            →
          </Link>
        )}
      </section>
      <section className="comparison-section" id="decision">
        <h2>{zh ? "何时选择 Lavik" : "When to choose Lavik"}</h2>
        <p>{copy.choose[locale]}</p>
        <h3>
          {zh
            ? "何时保留现有方案"
            : "When keeping your current system makes sense"}
        </h3>
        <p>{copy.retain[locale]}</p>
        <h3>{zh ? "从测试到迁移" : "From evaluation to migration"}</h3>
        <ol>
          <li>
            {zh
              ? "列出所用命令、数据类型、脚本与客户端选项，对照版本化兼容范围。"
              : "Inventory commands, data types, scripts and client options against the versioned compatibility coverage."}{" "}
            <Link href={`/${locale}/docs/0.1.0/commands/`}>
              {zh ? "命令参考" : "Command reference"}
            </Link>{" "}
            ·{" "}
            <Link href={`/${locale}/docs/0.1.0/clients/`}>
              {zh ? "客户端兼容性" : "Client compatibility"}
            </Link>
          </li>
          <li>
            {zh
              ? "在代表性 NVMe SSD 上回放实际数据分布、过期率和读写比例，比较目标 p99/p99.9，而非只看峰值 QPS。"
              : "Replay your data distribution, expiry rate and read/write mix on representative NVMe SSD hardware. Compare target p99/p99.9 rather than only peak QPS."}
          </li>
          <li>
            {zh
              ? "验证复制、恢复和故障期间容量余量，再进行可回退的小流量切换。"
              : "Validate replication, recovery and capacity headroom during failures, then make a small, reversible traffic cutover."}{" "}
            <Link href={`/${locale}/docs/0.1.0/`}>
              {zh ? "迁移与集群指南" : "Migration and cluster guides"}
            </Link>
          </li>
        </ol>
      </section>
      <section className="comparison-section" id="faq">
        <h2>{zh ? "常见问题" : "Frequently asked questions"}</h2>
        {comparisonFaq(product.id, locale).map((f) => (
          <div className="comparison-faq" key={f.question}>
            <h3>{f.question}</h3>
            <p>{f.answer}</p>
          </div>
        ))}
      </section>
      <section className="comparison-section" id="sources">
        <h2>{zh ? "来源与版本" : "Sources and versions"}</h2>
        <p>
          {zh
            ? "基准绑定上游提交；产品文档按标注日期核对。八月历史构建与九月 beta.1 结果保留各自范围，不跨实验拼接。"
            : "Benchmarks are pinned to an upstream commit; product documentation was checked on the date shown. Historical August builds and September beta.1 results retain their own scope and are not combined across experiments."}
        </p>
        <ul>
          {[
            ...new Set([
              ...copy.sources,
              "lavik-beta-overview",
              "lavik-license",
            ]),
          ].map((s) => (
            <li key={s}>
              <SourceLink id={s}>{sourceLabel(s, zh)}</SourceLink>
            </li>
          ))}
        </ul>
      </section>
      <section className="comparison-cta">
        <p className="eyebrow">APACHE 2.0 · REDIS COMPATIBLE · NVMe SSD</p>
        <h2>
          {zh
            ? "用你的工作负载，验证容量与速度。"
            : "Put your workload behind the comparison."}
        </h2>
        <div className="comparison-actions">
          <Link className="button primary" href={`/${locale}/download/`}>
            {zh ? "下载 Lavik beta.1" : "Download Lavik beta.1"} ↗
          </Link>
          <Link href={`/${locale}/docs/0.1.0/`}>
            {zh ? "阅读安装指南" : "Read the installation guides"} →
          </Link>
        </div>
      </section>
      <nav
        className="comparison-related"
        aria-label={zh ? "其他产品对比" : "Other product comparisons"}
      >
        {comparisonProducts
          .filter((p) => p.id !== product.id)
          .map((p) => (
            <Link key={p.id} href={`/${locale}/${comparisonRoute(p.id)}/`}>
              Lavik vs {p.name} →
            </Link>
          ))}
      </nav>
    </main>
  );
}
function sourceLabel(id: string, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    "beta-report": [
      "September 18 beta.1 benchmark: methods, versions and results",
      "9 月 18 日 beta.1 基准：方法、版本与结果",
    ],
    "beta-results": [
      "All September measurements (CSV)",
      "九月全部测量数据（CSV）",
    ],
    "tiering-report": [
      "August 11–12 storage comparison: configurations and results",
      "8 月 11–12 日存储对比：配置与结果",
    ],
    "lavik-beta-overview": [
      "Lavik beta.1 system architecture",
      "Lavik beta.1 系统架构",
    ],
    "lavik-beta-storage": [
      "Lavik beta.1 storage and recovery",
      "Lavik beta.1 存储与恢复",
    ],
    "lavik-license": ["Lavik Apache 2.0 license", "Lavik Apache 2.0 许可证"],
    "dragonfly-docs": [
      "Dragonfly SSD tiering documentation",
      "Dragonfly SSD 分层文档",
    ],
    "dragonfly-ga": [
      "Dragonfly GA announcement and experimental collection tiering",
      "Dragonfly GA 公告与实验性集合分层",
    ],
    "garnet-features": [
      "Garnet features and Tsavorite storage",
      "Garnet 功能与 Tsavorite 存储",
    ],
    "kvrocks-structures": [
      "Apache Kvrocks data structures on RocksDB",
      "Apache Kvrocks 的 RocksDB 数据结构",
    ],
    "pika-readme": [
      "Pika README at the tested source commit",
      "Pika 测试源码提交的 README",
    ],
    "tendis-readme": [
      "Tendis README at the tested source commit",
      "Tendis 测试源码提交的 README",
    ],
    "keydb-flash": ["KeyDB On Flash documentation", "KeyDB On Flash 文档"],
    "keydb-sizing": [
      "KeyDB On Flash sizing and workload guidance",
      "KeyDB On Flash 容量与负载指南",
    ],
  };
  return labels[id]?.[zh ? 1 : 0] ?? id;
}
