import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { release, sources } from "../../../packages/content/repository";
import { requireReviewedManual } from "../../../packages/manual/gate";
import { useCases, type UseCase } from "../../../packages/use-cases/content";
import {
  storagePoints,
  historicalRows,
  scenarioReport,
  storageReportUrl,
  historicalReportUrl,
  storageCsvUrl,
} from "../../../packages/use-cases/repository";
import { selectStoragePoint } from "../../../packages/use-cases/measurements";
import { LatencyExplorer } from "./latency-explorer";

function UseCaseCards({
  locale,
  entries,
}: {
  locale: Locale;
  entries: UseCase[];
}) {
  return (
    <div className="solution-cards">
      {entries.map((entry) => (
        <Link
          className="solution-card"
          href={`/${locale}/use-cases/${entry.slug}/`}
          key={entry.slug}
        >
          <span className="solution-card-arrow" aria-hidden="true">
            ↗
          </span>
          <h3>{entry.title[locale]}</h3>
          <p>{entry.navSummary[locale]}</p>
          <span className="solution-card-driver">
            {entry.valueDriver[locale]}
          </span>
        </Link>
      ))}
    </div>
  );
}
function CapacityNote({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <div className="solution-capacity-note">
      <strong>20×</strong>
      <div>
        <h3>{zh ? "更低的值容量成本" : "lower value-capacity cost"}</h3>
        <p>
          {zh
            ? "当 DRAM 每 GiB 的价格是 NVMe SSD 的 20 倍，相同值数据的介质容量成本为 1/20，即降低 95%。索引内存、CPU、副本、存储放大与恢复余量仍需计入完整部署。"
            : "When DRAM costs 20 times as much per GiB as NVMe SSD, the same value payload costs one twentieth as much for media capacity: 95% less. Include index memory, CPU, replicas, storage amplification, and recovery headroom in the complete deployment."}
        </p>
        <Link className="text-link" href={`/${locale}/cost/`}>
          {zh ? "用你的容量价格计算" : "Calculate with your capacity prices"} →
        </Link>
      </div>
    </div>
  );
}
function EvidenceSummary({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN",
    points = storagePoints();
  const peak = selectStoragePoint(points, "lavik-spdk", "GET", null)!;
  const peer = selectStoragePoint(points, "dragonfly", "GET", null)!;
  const within = selectStoragePoint(points, "lavik-spdk", "GET", 1)!;
  return (
    <div className="solution-proof-strip">
      <div>
        <strong>1B</strong>
        <span>{zh ? "键 × 1 KiB 值" : "keys × 1 KiB values"}</span>
      </div>
      <div>
        <strong>{(peak.qps / peer.qps).toFixed(2)}×</strong>
        <span>
          {zh
            ? "Dragonfly 对照组的 GET 峰值吞吐量"
            : "Dragonfly control's peak GET throughput"}
        </span>
      </div>
      <div>
        <strong>{within.p99.toFixed(3)} ms</strong>
        <span>
          {zh
            ? `在 ${Math.round(within.qps).toLocaleString("en-US")} GET/s 时的 p99`
            : `p99 at ${Math.round(within.qps).toLocaleString("en-US")} GET/s`}
        </span>
      </div>
    </div>
  );
}

export function UseCasesHome({ locale }: { locale: Locale }) {
  const publication = requireReviewedManual(),
    zh = locale === "zh-CN";
  return (
    <main
      id="main"
      className="solution-home"
      data-manual-hash={publication.bundleHash}
    >
      <section className="container solution-hero">
        <p className="eyebrow">
          {zh ? "LAVIK / 使用场景" : "LAVIK / USE CASES"}
        </p>
        <h1>
          {zh ? "数据持续增长。" : "Your data keeps growing."}
          <em>
            {zh ? "内存账单不必同比增长。" : "Your memory bill shouldn't."}
          </em>
        </h1>
        <p className="solution-lead">
          {zh
            ? "全放内存，容量太贵。移到磁盘，延迟必须达标。Lavik 用 NVMe SSD 承载值数据，通过优化 I/O 路径把两者兼顾——从你的工作负载出发，用真实证据评估。"
            : "Keeping every value in memory gets expensive. Moving it to disk still has to meet the latency deadline. Lavik puts value capacity on NVMe SSD and optimizes the I/O path to address both. Start with your workload and inspect the evidence."}
        </p>
        <div className="button-row">
          <a href="#workloads" className="button primary">
            {zh ? "找到你的使用场景" : "Find your use case"} ↓
          </a>
          <a href="#evidence" className="button secondary">
            {zh ? "查看延迟证据" : "Inspect latency evidence"} ↓
          </a>
        </div>
      </section>
      <div className="container">
        <EvidenceSummary locale={locale} />
        <p className="solution-proof-caption">
          {zh
            ? "2026-09-18 beta SPDK 报告。十亿键、1 KiB 值；对照数据复用同一组主机上的较早测量。不同连接数下的实测点，完整范围见下文。"
            : "September 18 beta SPDK report. One billion keys, 1 KiB values; peer controls reuse earlier measurements on the same hosts. Observed points at different connection counts; full scope below."}
        </p>
      </div>
      <section className="container solution-section" id="workloads">
        <div className="solution-section-heading">
          <p className="eyebrow">{zh ? "按工作负载" : "BY WORKLOAD"}</p>
          <h2>
            {zh
              ? "从访问模式和状态规模出发。"
              : "Start with access patterns and retained state."}
          </h2>
          <p>
            {zh
              ? "容量增长的原因不同，迁移时需要验证的边界也不同。"
              : "Different reasons for dataset growth call for different migration tests."}
          </p>
        </div>
        <UseCaseCards
          locale={locale}
          entries={useCases.filter((c) => c.group === "workload")}
        />
      </section>
      <section className="container solution-section" id="industries">
        <div className="solution-section-heading">
          <p className="eyebrow">{zh ? "按行业" : "BY INDUSTRY"}</p>
          <h2>
            {zh
              ? "让存储设计符合业务路径。"
              : "Make the storage design fit the business path."}
          </h2>
          <p>
            {zh
              ? "明确新鲜度、权威状态、请求截止时间和恢复路径。"
              : "Account for freshness, authoritative state, request deadlines, and recovery."}
          </p>
        </div>
        <UseCaseCards
          locale={locale}
          entries={useCases.filter((c) => c.group === "industry")}
        />
      </section>
      <section className="container solution-section" id="economics">
        <CapacityNote locale={locale} />
      </section>
      <section className="container solution-section" id="evidence">
        <div className="solution-section-heading">
          <p className="eyebrow">
            {zh ? "容量之外，还要看延迟" : "CAPACITY IS HALF THE QUESTION"}
          </p>
          <h2>
            {zh
              ? "在你的 p99 预算内，还剩多少吞吐量？"
              : "How much throughput fits the p99 budget?"}
          </h2>
          <p>
            {zh
              ? "在十亿键、1 KiB 值的同一组已发布测量中，按延迟筛选或查看每个系统的吞吐量峰值。"
              : "Filter the published billion-key, 1 KiB-value measurements by latency, or inspect each system's throughput peak."}
          </p>
        </div>
        <LatencyExplorer locale={locale} points={storagePoints()} />
        <div className="solution-evidence-scope">
          <h3>{zh ? "这组结果的边界" : "What these measurements represent"}</h3>
          <p>
            {zh
              ? "值数据约 0.93 TiB，服务器约 126 GiB RAM。Lavik 使用下载的 v0.1.0-beta.1 Standard 包、16 个工作线程、SPDK 与六块 NVMe SSD。测试为均匀随机 GET 或覆盖 SET、pipeline=1，每点 60 秒，扫描 80–2,560 个连接。"
              : "Approximately 0.93 TiB of value payload on a server with about 126 GiB RAM. Lavik uses the downloaded v0.1.0-beta.1 Standard package, 16 workers, SPDK, and six NVMe SSDs. Uniform random GET or overwriting SET, pipeline=1, 60 seconds per point, with 80–2,560 connections."}
          </p>
          <p>
            {zh
              ? "Dragonfly 1.40.2 与 Garnet 2.1.5 对照来自同主机较早的扫描，软件按顺序运行。CPU 构建目标、内存预留、磁盘拓扑、缓存策略与持久化设置不同；每点仅测量一次，不能据此推断等价崩溃持久性或你的应用 SLA。"
              : "Dragonfly 1.40.2 and Garnet 2.1.5 controls come from an earlier sweep on the same hosts, with products run sequentially. CPU build targets, memory reservations, disk topology, caching, and persistence settings differ. Each point was measured once; these results do not establish equal crash durability or your application's SLA."}
          </p>
          <div className="solution-source-links">
            <a className="text-link" href={storageReportUrl}>
              {zh
                ? "方法、配置与原始报告"
                : "Method, configurations & source report"}{" "}
              ↗
            </a>
            <a className="text-link" href={storageCsvUrl}>
              {zh ? "完整测量 CSV" : "Full measurement CSV"} ↗
            </a>
          </div>
        </div>
      </section>
      <section className="container solution-section" id="storage-options">
        <div className="solution-section-heading">
          <p className="eyebrow">
            {zh ? "理解存储路径" : "UNDERSTAND THE STORAGE PATH"}
          </p>
          <h2>
            {zh
              ? "SSD 方案之间，也有架构差异。"
              : "SSD-backed designs take different paths."}
          </h2>
        </div>
        <div className="storage-designs">
          <article>
            <h3>Lavik</h3>
            <p>
              {zh
                ? "紧凑的 DRAM 键索引与存储中的值数据。工作线程拥有分区，协程重叠网络与存储 I/O，提供 io_uring 和 SPDK 路径。应测试数据保留量增加时的索引内存、I/O 队列与后台回收。"
                : "A compact DRAM key index with values in storage. Workers own partitions, and coroutines overlap network and storage I/O through io_uring or SPDK paths. Test index growth, I/O queues, and background reclamation as retained data increases."}
            </p>
            <a
              className="text-link"
              href={sources.find((s) => s.id === "architecture")!.url}
            >
              {zh ? "版本固定的架构" : "Pinned architecture"} ↗
            </a>
          </article>
          <article>
            <h3>Dragonfly SSD tiering</h3>
            <p>
              {zh
                ? "可配置的内存/SSD 层、内存索引与异步 I/O。当前文档包含字符串分层，以及带条件的实验性列表/哈希分层。应按实际数据类型和访问分布测量磁盘读取比例、升降层与背压。"
                : "Configurable memory/SSD tiers, an in-memory index, and asynchronous I/O. Current docs cover string tiering plus conditional experimental list/hash tiering. Measure disk-read share, promotion/offloading, and backpressure for your data types and access distribution."}
            </p>
            <a
              className="text-link"
              href="https://www.dragonflydb.io/docs/managing-dragonfly/tiering"
            >
              {zh ? "Dragonfly 分层文档" : "Dragonfly tiering docs"} ↗
            </a>
          </article>
          <article>
            <h3>Apache Kvrocks</h3>
            <p>
              {zh
                ? "使用 RocksDB 的独立 Redis 兼容数据库，具备缓存与键值分离选项。应在真实读写组合下测量缓存命中、读放大、compaction 与持久化设置的影响。"
                : "A distinct Redis-compatible database built on RocksDB, with caching and key-value separation options. Measure cache behavior, read amplification, compaction, and persistence settings under the actual read/write mix."}
            </p>
            <a
              className="text-link"
              href="https://kvrocks.apache.org/blog/how-we-use-rocksdb-in-kvrocks/"
            >
              {zh ? "Kvrocks 存储设计" : "Kvrocks storage design"} ↗
            </a>
          </article>
        </div>
        <p className="solution-proof-caption">
          {zh
            ? "架构分析：当磁盘读取和后台工作进入关键路径时，热集上的平均延迟不能代表低局部性访问的尾延迟。Lavik 也需要相同的工作负载验证；不能只凭“使用 SSD”判断系统是否达标。外部文档核对于 2026-09-21。"
            : "Architecture implication: when disk reads and background work enter the critical path, warm-set average latency does not describe the low-locality tail. Apply the same workload tests to Lavik; using SSD alone does not determine whether a system meets its target. External docs checked September 21, 2026."}
        </p>
      </section>
      <section className="container solution-section" id="kvrocks-comparison">
        <div className="solution-section-heading">
          <p className="eyebrow">
            {zh ? "独立的历史比较" : "A SEPARATE HISTORICAL COMPARISON"}
          </p>
          <h2>
            {zh
              ? "包含 Kvrocks 的两亿键读写测试。"
              : "Two hundred million keys, including Kvrocks."}
          </h2>
          <p>
            {zh
              ? "2026-08-12：两块 NVMe SSD、1,000–4,000 字节随机值、80 个连接、每负载 300 秒。此表与上方 beta 十亿键测试采用不同配置，应分别解读。"
              : "August 12, 2026: two NVMe SSDs, random 1,000–4,000-byte values, 80 connections, and 300 seconds per workload. This setup differs from the beta billion-key test above; interpret the tables separately."}
          </p>
        </div>
        <div className="solution-table-scroll">
          <table className="historical-table">
            <thead>
              <tr>
                <th>{zh ? "负载" : "Workload"}</th>
                <th>{zh ? "系统" : "System"}</th>
                <th>QPS</th>
                <th>p99</th>
                <th>p99.9</th>
              </tr>
            </thead>
            <tbody>
              {historicalRows().map((row) => (
                <tr
                  key={`${row.workload}-${row.system}`}
                  className={
                    row.system === "Lavik SPDK" ? "lavik-result" : undefined
                  }
                >
                  <th scope="row">{row.workload}</th>
                  <td>{row.system}</td>
                  <td>{Math.round(row.qps).toLocaleString("en-US")}</td>
                  <td>{row.p99.toFixed(3)} ms</td>
                  <td>{row.p999.toFixed(3)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="solution-proof-caption">
          {zh
            ? "历史 Lavik SPDK 构建，非 beta 包的复测。Dragonfly 1.40.1 开启 buffered I/O，并在加载后预热 180 秒；Kvrocks 2.16.0 使用 80 GiB block cache、BlobDB，关闭 WAL、per-write sync、压缩和 Blob GC，并保持 auto compaction。Lavik 保持 defrag。差异影响缓存状态与故障恢复语义，结果不证明等价持久性。"
            : "Historical Lavik SPDK build, not a rerun of the beta package. Dragonfly 1.40.1 uses buffered I/O and a 180-second post-load warmup; Kvrocks 2.16.0 uses an 80 GiB block cache and BlobDB with WAL, per-write sync, compression, and Blob GC disabled, while auto compaction remains enabled. Lavik retains defrag. These differences affect cache state and recovery semantics; the results do not establish equal durability."}
        </p>
        <a className="text-link" href={historicalReportUrl}>
          {zh
            ? "完整结果、调优与公平性说明"
            : "Full results, tuning & fairness notes"}{" "}
          ↗
        </a>
      </section>
      <section className="container solution-closing">
        <div>
          <h2>{zh ? "把你的工作负载带来。" : "Bring your workload."}</h2>
          <p>
            {zh
              ? "固定版本、真实请求轨迹、明确延迟预算。用你自己的结果决定迁移。"
              : "A pinned version, a real request trace, and a clear latency budget. Make the migration decision with your own results."}
          </p>
        </div>
        <Link className="button primary" href={`/${locale}/download/`}>
          {zh ? "下载 Lavik" : "Download Lavik"} →
        </Link>
      </section>
    </main>
  );
}

export function UseCasePage({
  locale,
  entry,
}: {
  locale: Locale;
  entry: UseCase;
}) {
  const publication = requireReviewedManual(),
    zh = locale === "zh-CN",
    report = scenarioReport(),
    example = report.scenarios.find((s) => s.name === entry.slug)!;
  const sections = [
    ["pressure", zh ? "容量与延迟压力" : "The capacity / latency pressure"],
    ["fit", zh ? "Lavik 的位置" : "Where Lavik fits"],
    ["design", zh ? "设计决策" : "Design decisions"],
    ["example", zh ? "经过测试的示例" : "Tested example"],
    ["evaluate", zh ? "验收标准" : "Acceptance criteria"],
    ["sizing", zh ? "容量规划" : "Capacity planning"],
  ];
  const transcript = example.steps
    .map(
      (step) =>
        `> ${step.argv.map((arg) => (/^[\w:.-]+$/.test(arg) ? arg : JSON.stringify(arg))).join(" ")}\n${JSON.stringify(step.actual)}`,
    )
    .join("\n\n");
  return (
    <main
      id="main"
      className="solution-detail"
      data-manual-hash={publication.bundleHash}
    >
      <header className="container solution-detail-hero">
        <div className="breadcrumb">
          <Link href={`/${locale}/use-cases/`}>
            {zh ? "使用场景" : "Use cases"}
          </Link>
          <span>/</span>
          <span>{entry.title[locale]}</span>
        </div>
        <p className="eyebrow">
          {entry.group === "industry"
            ? zh
              ? "行业应用"
              : "INDUSTRY APPLICATION"
            : zh
              ? "工作负载"
              : "WORKLOAD PATTERN"}
        </p>
        <h1>{entry.headline[locale]}</h1>
        <p className="solution-lead">{entry.summary[locale]}</p>
        <div className="solution-tags">
          <span>{release.tag}</span>
          <span>Redis / Valkey</span>
          <span>NVMe SSD</span>
        </div>
      </header>
      <div className="container solution-detail-grid">
        <article className="solution-article">
          <section id="pressure">
            <h2>
              {zh
                ? "容量与延迟，为什么同时成为问题？"
                : "Why capacity and latency collide"}
            </h2>
            {entry.pressure.map((p, index) => (
              <p key={index}>{p[locale]}</p>
            ))}
          </section>
          <section id="fit">
            <p className="eyebrow">
              {zh ? "为这条数据路径而设计" : "DESIGN FOR THIS DATA PATH"}
            </p>
            <h2>{zh ? "Lavik 在架构中的位置" : "Where Lavik fits"}</h2>
            <p>{entry.fit[locale]}</p>
            <figure className="solution-architecture">
              <div className="architecture-node">
                <small>{zh ? "请求路径" : "REQUEST PATH"}</small>
                <strong>{entry.serving[locale]}</strong>
                <span>
                  {zh ? "Redis 兼容客户端" : "Redis-compatible client"}
                </span>
              </div>
              <div className="architecture-arrow" aria-hidden="true">
                ⇄
              </div>
              <div className="architecture-node lavik-node">
                <strong>Lavik</strong>
                <span>{zh ? "DRAM · 键索引" : "DRAM · key index"}</span>
                <span>
                  {zh ? "NVMe SSD · 值存储" : "NVMe SSD · value storage"}
                </span>
              </div>
              <figcaption>
                {zh
                  ? "应用负责刷新或投影，权威数据源保留在："
                  : "Application-managed refresh / projections from: "}
                <strong>{entry.origin[locale]}</strong>
              </figcaption>
            </figure>
            <p className="solution-fit-line">
              <strong>
                {zh ? "优先评估：" : "Strongest evaluation fit: "}
              </strong>
              {entry.bestFit[locale]}
            </p>
          </section>
          <section id="design">
            <h2>
              {zh
                ? "影响采用结果的设计决策"
                : "Design decisions that determine the outcome"}
            </h2>
            <div className="solution-decisions">
              {entry.decisions.map((item, index) => (
                <div key={index}>
                  <span className="decision-number">0{index + 1}</span>
                  <div>
                    <h3>{item.title[locale]}</h3>
                    <p>{item.body[locale]}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section id="example">
            <div className="solution-example-heading">
              <h2>
                {zh
                  ? "在 Lavik 上执行的命令示例"
                  : "A command example executed on Lavik"}
              </h2>
              <span className="status-pill">
                {zh ? "Docker 测试通过" : "Docker check passed"}
              </span>
            </div>
            <p>
              {zh
                ? "以下是使用示例数据、独立实例和真实回复的功能测试。它验证展示的命令序列，不是该行业工作负载的性能或端到端正确性测试。"
                : "A functional check using example data, an isolated instance, and actual replies. It verifies the command sequence shown; it is not a performance or end-to-end correctness test of the industry workload."}
            </p>
            <div className="solution-command-links">
              {entry.commands.map((name) => (
                <Link
                  key={name}
                  href={`/${locale}/docs/0.1.0/commands/${name.toLowerCase()}/`}
                >
                  {name}
                </Link>
              ))}
            </div>
            <details className="solution-transcript">
              <summary>
                {zh
                  ? "查看实际请求与回复"
                  : "Inspect actual requests and replies"}
              </summary>
              <pre>
                <code>{transcript}</code>
              </pre>
            </details>
            <details className="solution-verification">
              <summary>
                {zh ? "版本与验证范围" : "Version and verification scope"}
              </summary>
              <p>
                {report.binaryVersion} ·{" "}
                {zh ? "Minimal 发布包" : "Minimal package"} ·{" "}
                {report.architecture} · {report.finishedAt.slice(0, 10)}
              </p>
              <p>
                {zh
                  ? "离线、只读容器根文件系统；临时数据目录，逐场景清空。示例使用已认证的本地连接。TTL 返回范围与具体参数保存在验证记录中。"
                  : "Offline container with a read-only root, temporary data, and a reset between scenarios. Examples use an authenticated local connection. TTL ranges and exact arguments are preserved in the execution receipt."}
              </p>
              <a
                className="text-link"
                href="https://github.com/eloqdata/lavik-agent/blob/main/evidence/use-cases/0.1.0/scenarios.json"
              >
                {zh ? "执行记录" : "Execution receipt"} ↗
              </a>
            </details>
            <Link
              className="text-link"
              href={`/${locale}/docs/0.1.0/quick-start/`}
            >
              {zh ? "启动本地实例" : "Start a local instance"} →
            </Link>
          </section>
          <section id="evaluate">
            <h2>
              {zh
                ? "用什么标准决定迁移？"
                : "What should decide the migration?"}
            </h2>
            <p>
              {zh
                ? "先写下业务预算，再做流量回放。以下标准需要通过你自己的系统验证；已发布基准是起点。"
                : "Write down the application budgets before replaying traffic. Validate these criteria in your own system; published benchmarks are a starting point."}
            </p>
            <div className="solution-trials">
              {entry.trials.map((item, index) => (
                <article key={index}>
                  <h3>{item.title[locale]}</h3>
                  <p>{item.measure[locale]}</p>
                  <div>
                    <strong>{zh ? "验收条件" : "Accept when"}</strong>
                    <p>{item.accept[locale]}</p>
                  </div>
                </article>
              ))}
            </div>
            <p className="solution-boundary">{entry.boundary[locale]}</p>
          </section>
          <section id="sizing">
            <h2>
              {zh
                ? "从业务规模推导容量"
                : "Translate business scale into capacity"}
            </h2>
            <p className="solution-equation">{entry.equation[locale]}</p>
            <CapacityNote locale={locale} />
          </section>
          <section className="solution-related">
            <h2>{zh ? "相关的使用场景" : "Related use cases"}</h2>
            <UseCaseCards
              locale={locale}
              entries={entry.related.map((slug) =>
                useCases.find((c) => c.slug === slug)!,
              )}
            />
          </section>
        </article>
        <aside className="solution-aside">
          <div className="solution-aside-inner">
            <nav aria-label={zh ? "本页内容" : "On this page"}>
              <span className="eyebrow">
                {zh ? "本页内容" : "ON THIS PAGE"}
              </span>
              {sections.map(([id, title]) => (
                <a key={id} href={`#${id}`}>
                  {title}
                </a>
              ))}
            </nav>
            <div className="solution-aside-proof">
              <span className="eyebrow">
                {zh ? "查看证据" : "INSPECT THE EVIDENCE"}
              </span>
              <strong>1B</strong>
              <p>
                {zh
                  ? "十亿键 SPDK 测试，提供完整连接数扫描与延迟数据。"
                  : "A billion-key SPDK test, with the full connection sweep and latency data."}
              </p>
              <Link href={`/${locale}/use-cases/#evidence`}>
                {zh ? "按 p99 预算筛选" : "Explore by p99 budget"} →
              </Link>
              <Link href={`/${locale}/docs/0.1.0/clients/`}>
                {zh ? "已测试的客户端" : "Tested clients"} →
              </Link>
            </div>
            <Link className="button primary" href={`/${locale}/download/`}>
              {zh ? "下载 Lavik" : "Download Lavik"} →
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
