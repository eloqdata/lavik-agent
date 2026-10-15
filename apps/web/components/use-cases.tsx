import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { requireReviewedManual } from "../../../packages/manual/gate";
import { useCases, type UseCase } from "../../../packages/use-cases/content";
import { scenarioDefinitions } from "../../../packages/use-cases/repository";
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
            ? "同样的值容量，按 DRAM/NVMe SSD 每 GiB 单价 20:1 计算，介质成本降低 95%。用你的实际价格、索引内存与副本配置规划完整预算。"
            : "At a 20:1 DRAM/NVMe SSD price per GiB, the same value capacity costs 95% less in media. Plan the complete budget with your actual prices, index memory and replicas."}
        </p>
        <Link className="text-link" href={`/${locale}/cost/`}>
          {zh ? "计算你的容量成本" : "Calculate your capacity cost"} →
        </Link>
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
        <p className="eyebrow">LAVIK 0.1.0 / {zh ? "使用场景" : "USE CASES"}</p>
        <h1>
          {zh ? "让有价值的数据留在线上。" : "Keep more useful data online."}
          <em>
            {zh
              ? "用 SSD 的容量，服务实时请求。"
              : "Serve it at the speed your application needs."}
          </em>
        </h1>
        <p className="solution-lead">
          {zh
            ? "保留更完整的商品目录、更长的会话历史和更多实体特征。Lavik 将值存于 NVMe SSD，通过 Redis 兼容接口提供快速访问，让数据增长不再要求每个字节都使用 DRAM。"
            : "Keep a larger catalog, longer-lived sessions and more features per entity. Lavik stores values on NVMe SSD and serves them through a Redis-compatible interface, so retaining more data no longer means buying DRAM for every byte."}
        </p>
        <div className="button-row">
          <a href="#workloads" className="button primary">
            {zh ? "找到你的场景" : "Find your use case"} ↓
          </a>
          <Link
            className="button secondary"
            href={`/${locale}/docs/0.1.0/quick-start/`}
          >
            {zh ? "开始使用" : "Start with Lavik"} →
          </Link>
        </div>
      </section>
      <div className="container">
        <div className="solution-proof-strip">
          <div>
            <strong>1B</strong>
            <span>{zh ? "个键 × 1 KiB 值" : "keys × 1 KiB values"}</span>
          </div>
          <div>
            <strong>385,514</strong>
            <span>
              {zh ? "80 个连接下的 GET QPS" : "GET QPS at 80 connections"}
            </span>
          </div>
          <div>
            <strong>0.439 ms</strong>
            <span>
              {zh ? "同一测量点的 GET p99.9" : "GET p99.9 at that same point"}
            </span>
          </div>
        </div>
        <p className="solution-proof-caption">
          {zh
            ? "Lavik 0.1.0 · 2026-10-14 · 16 vCPU · 六块 NVMe SSD。"
            : "Lavik 0.1.0 · October 14, 2026 · 16 vCPUs · six NVMe SSDs."}{" "}
          <Link href={`/${locale}/benchmarks/1tb-storage/`}>
            {zh ? "完整基准与复现步骤" : "Full benchmark and reproduction"} →
          </Link>
        </p>
      </div>
      <section className="container solution-section" id="workloads">
        <div className="solution-section-heading">
          <p className="eyebrow">{zh ? "按工作负载" : "BY WORKLOAD"}</p>
          <h2>
            {zh
              ? "从缓存到在线状态，为增长留出空间。"
              : "Room for growing caches and online state."}
          </h2>
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
              ? "让更多数据参与每一次服务。"
              : "Put more data behind every interaction."}
          </h2>
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
          <h2>
            {zh
              ? "从单个实例到十亿键，查看实际结果。"
              : "From a compact instance to a billion keys."}
          </h2>
          <p>
            {zh
              ? "2 vCPU、16 GiB 实例承载 1 亿个 1 KiB 值，GET 峰值仍接近较小数据集。16 vCPU 测试中，Lavik 的 GET 与 SET 峰值吞吐量超越内存 Redis、Valkey。选择与你的应用规模相符的报告。"
              : "On a 2-vCPU, 16 GiB instance, Lavik holds 100 million 1 KiB values while retaining nearly all of its smaller-dataset peak GET throughput. In the 16-vCPU test, its peak GET and SET throughput exceeds the tested Redis and Valkey configurations in DRAM. Choose the report closest to your application’s scale."}
          </p>
        </div>
        <div className="storage-designs">
          {[
            [
              "2vcpu-capacity",
              zh ? "小型实例上的容量" : "Capacity on compact instances",
              zh
                ? "从 100 万键扩展到 1 亿键。"
                : "From one million to 100 million keys.",
            ],
            [
              "redis-valkey",
              zh ? "对比 Redis 与 Valkey" : "Compare Redis and Valkey",
              zh
                ? "NVMe SSD 与 DRAM 的吞吐量对比。"
                : "NVMe SSD throughput against DRAM.",
            ],
            [
              "1tb-storage",
              zh ? "对比 SSD 数据库" : "Compare SSD-backed databases",
              zh
                ? "十亿键下的同连接数表现。"
                : "Matched concurrency at one billion keys.",
            ],
          ].map(([id, title, body]) => (
            <article key={id}>
              <h3>{title}</h3>
              <p>{body}</p>
              <Link href={`/${locale}/benchmarks/${id}/`}>
                {zh ? "查看报告" : "Read the report"} →
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="container solution-closing">
        <div>
          <h2>
            {zh
              ? "先把一个数据集放到 Lavik。"
              : "Put your first dataset on Lavik."}
          </h2>
          <p>
            {zh
              ? "安装 0.1.0、连接现有客户端，再用 RedisShake 演练迁移。"
              : "Install 0.1.0, connect your existing client, then rehearse migration with RedisShake."}
          </p>
        </div>
        <Link
          className="button primary"
          href={`/${locale}/docs/0.1.0/quick-start/`}
        >
          {zh ? "开始使用" : "Get started"} →
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
    example = scenarioDefinitions().find((s) => s.name === entry.slug)!;
  const sections = [
    ["pressure", zh ? "容量与延迟压力" : "The capacity / latency pressure"],
    ["fit", zh ? "Lavik 的位置" : "Where Lavik fits"],
    ["design", zh ? "设计决策" : "Design decisions"],
    ["example", zh ? "命令示例" : "Command pattern"],
    ["evaluate", zh ? "验收标准" : "Acceptance criteria"],
    ["sizing", zh ? "容量规划" : "Capacity planning"],
  ];
  const transcript = example.steps
    .map(
      (step) =>
        `redis-cli ${step.argv.map((arg) => (/^[\w:.-]+$/.test(arg) ? arg : JSON.stringify(arg))).join(" ")}`,
    )
    .join("\n");
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
        <div className="button-row">
          <Link
            className="button primary"
            href={`/${locale}/docs/0.1.0/quick-start/`}
          >
            {zh ? "开始使用 Lavik" : "Try Lavik"} →
          </Link>
          <Link
            className="button secondary"
            href={`/${locale}/docs/0.1.0/migrate-redis/`}
          >
            {zh ? "规划迁移" : "Plan your migration"} →
          </Link>
        </div>
        <div className="solution-tags">
          <span>Lavik 0.1.0</span>
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
              <strong>{zh ? "适用场景：" : "Best for: "}</strong>
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
              <h2>{zh ? "试用这一命令模式" : "Try this command pattern"}</h2>
              <span className="status-pill">
                {zh ? "Redis 兼容命令" : "Redis-compatible commands"}
              </span>
            </div>
            <p>
              {zh
                ? "先按快速入门启动 Lavik 0.1.0，再用这些示例键尝试场景中的基本操作。命令参考提供选项与返回值说明。"
                : "Start Lavik 0.1.0 with the quick start, then use these example keys to try the basic operations. Each command links to its options and return values."}
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
              <summary>{zh ? "查看示例命令" : "Show example commands"}</summary>
              <pre>
                <code>{transcript}</code>
              </pre>
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
                {zh ? "大容量实测" : "MEASURED AT SCALE"}
              </span>
              <strong>1B</strong>
              <p>
                {zh
                  ? "十亿键 SPDK 测试，提供完整连接数扫描与延迟数据。"
                  : "A billion-key SPDK test, with the full connection sweep and latency data."}
              </p>
              <Link href={`/${locale}/benchmarks/1tb-storage/`}>
                {zh ? "查看吞吐量与尾延迟" : "See throughput and tail latency"}{" "}
                →
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
