import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { homepageEvidence } from "../../../packages/homepage/evidence";
import {
  consolidationScenario as sizing,
  capacityLabel,
} from "../../../packages/homepage/scenarios";
import { ClusterIllustration } from "./cluster-illustration";
import { AgentCapacity } from "./agent-capacity";
import "./homepage-story.css";

export function HomepageStory({
  locale,
  sourceUrl,
  benchmarkDate,
}: {
  locale: Locale;
  sourceUrl: string;
  benchmarkDate: string;
}) {
  const zh = locale === "zh-CN";
  const t = (en: string, cn: string) => (zh ? cn : en);
  const docs = `/${locale}/docs/0.1.0`;
  const evidence = homepageEvidence();
  const aggregate = capacityLabel(
    sizing.redisNodes * sizing.redisValueGiBPerNode * 2 ** 30,
  );
  return (
    <div className="home-story">
      <nav
        className="home-section-nav container"
        aria-label={t("Explore Lavik", "了解 Lavik")}
      >
        {[
          ["architecture", "How it works", "工作原理"],
          ["consolidation", "Fewer nodes", "更少节点"],
          ["agents", "Agent workloads", "智能体工作负载"],
          ["open-source", "Open source", "开源承诺"],
        ].map(([id, en, cn]) => (
          <a key={id} href={`#${id}`}>
            {t(en, cn)}
            <span aria-hidden="true">↘</span>
          </a>
        ))}
      </nav>

      <section
        id="architecture"
        className="home-section container"
        aria-labelledby="home-architecture-title"
      >
        <div className="home-split-heading">
          <div>
            <p className="home-eyebrow">
              01 / {t("THE STORAGE MODEL", "存储模型")}
            </p>
            <h2 id="home-architecture-title">
              {t("Keep the Redis interface.", "保留 Redis 接口。")}
              <br />
              <em>{t("Grow beyond DRAM.", "容量突破内存。")}</em>
            </h2>
          </div>
          <p className="home-section-lead">
            {t(
              "When your dataset grows, keeping every value in memory gets expensive. Lavik keeps a compact key index in DRAM and places values on NVMe SSD, so more data does not mean buying DRAM for every byte.",
              "数据集持续增长时，把每个值都留在内存中，成本会越来越高。Lavik 在 DRAM 中保留紧凑的键索引，把值存于 NVMe SSD，让数据增长不再意味着为每个字节购买 DRAM。",
            )}
          </p>
        </div>
        <div
          className="home-engine"
          role="img"
          aria-label={t(
            "Redis clients connect over RESP2 or RESP3 to Lavik workers, which use a DRAM key index and NVMe SSD value storage.",
            "Redis 客户端通过 RESP2 或 RESP3 连接 Lavik 工作线程，使用 DRAM 键索引和 NVMe SSD 值存储。",
          )}
        >
          <div className="home-engine-client">
            <span className="home-engine-icon" aria-hidden="true">
              {">_"}
            </span>
            <strong>{t("Your application", "你的应用")}</strong>
            <span>Redis clients · RESP2 / RESP3</span>
          </div>
          <span className="home-engine-arrow" aria-hidden="true">
            →
          </span>
          <div className="home-engine-server">
            <span className="home-engine-label">LAVIK</span>
            <div className="home-worker-row" aria-hidden="true">
              {[1, 2, 3, 4].map((i) => (
                <span key={i}>worker {i}</span>
              ))}
            </div>
            <div className="home-storage-row">
              <div>
                <span>DRAM</span>
                <strong>{t("Key index", "键索引")}</strong>
                <small>{t("Locate your data", "定位数据")}</small>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span>NVMe SSD</span>
                <strong>{t("Value capacity", "值数据容量")}</strong>
                <small>{t("Room for your dataset", "承载数据集")}</small>
              </div>
            </div>
          </div>
        </div>
        <div className="home-three-cards">
          <article>
            <span className="home-card-number">01</span>
            <h3>{t("Familiar commands and clients", "熟悉的命令与客户端")}</h3>
            <p>
              {t(
                "Use Redis data structures, RESP2/RESP3 clients, and familiar application patterns. Check the commands, client versions, and behaviors your application depends on.",
                "沿用 Redis 数据结构、RESP2/RESP3 客户端和熟悉的应用模式。按应用核对命令、客户端版本和行为兼容性。",
              )}
            </p>
            <Link href={`${docs}/compatibility/`}>
              {t("Check compatibility", "查看兼容性")} ↗
            </Link>
          </article>
          <article>
            <span className="home-card-number">02</span>
            <h3>{t("20× lower value-capacity cost", "值容量成本降至 1/20")}</h3>
            <p>
              {t(
                "At a 20:1 DRAM-to-NVMe SSD price per GiB, the same value capacity costs 5% as much. Index memory, replication, and shared server costs are additional. Use your prices in the calculator.",
                "按 DRAM 与 NVMe SSD 每 GiB 单价 20:1 计算，同等值容量仅需 5% 的成本。索引内存、复制和共同服务器成本另计；可在计算器中填入自己的价格。",
              )}
            </p>
            <Link href={`/${locale}/cost/`}>
              {t("Calculate your capacity cost", "计算容量成本")} ↗
            </Link>
          </article>
          <article>
            <span className="home-card-number">03</span>
            <h3>{t("An engine built for NVMe", "围绕 NVMe 设计的引擎")}</h3>
            <p>
              {t(
                "Workers process independent requests in parallel. Coroutines overlap I/O with other work. The Standard package includes SPDK storage support—the backend used in the headline benchmark.",
                "工作线程并行处理独立请求，协程让 I/O 与其他工作重叠执行。Standard 包包含 SPDK 存储支持，首页基准测试使用的正是这一后端。",
              )}
            </p>
            <Link href={`/${locale}/blog/inside-lavik-request-path/`}>
              {t("Inside the request path", "了解请求处理路径")} ↗
            </Link>
          </article>
        </div>
      </section>

      <section className="home-scale-band" aria-labelledby="home-scale-title">
        <div className="container home-scale-grid">
          <div>
            <p className="home-eyebrow">
              {t("CAPACITY, WITH MEASURED PERFORMANCE", "大容量，也有实测性能")}
            </p>
            <h2 id="home-scale-title">
              {t("A billion keys.", "十亿个键。")}
              <br />
              {t("Values on NVMe SSD.", "值存于 NVMe SSD。")}
            </h2>
            <p>
              {t(
                "The published storage-tier experiment goes beyond the small in-memory comparison: one billion keys with 1 KiB values, on a host with approximately 126 GiB RAM.",
                "已发布的存储层实验覆盖了比小数据集内存对照更大的规模：十亿个键、每个值 1 KiB，主机内存约 126 GiB。",
              )}
            </p>
            <a href={sourceUrl}>
              {t("Read the full storage-tier experiment", "阅读完整存储层实验")}{" "}
              ↗
            </a>
          </div>
          <div className="home-scale-stats">
            <div>
              <strong>1B</strong>
              <span>{t("keys × 1 KiB values", "个键 × 1 KiB 值")}</span>
            </div>
            <div>
              <strong>{evidence.billionGet.qps.toLocaleString("en-US")}</strong>
              <span>
                {t("peak GET requests / second", "峰值 GET 请求 / 秒")}
              </span>
            </div>
            <div>
              <strong>
                {evidence.billionGet.p99} <small>ms</small>
              </strong>
              <span>
                {t("GET p99 at that same point", "同一测量点的 GET p99")}
              </span>
            </div>
          </div>
          <p className="home-scale-note">
            {t(
              `SPDK · ${benchmarkDate} · ${evidence.billionGet.connections} connections · pipeline=1 · 60-second window. Single-server result; repeat with your workload.`,
              `SPDK · ${benchmarkDate} · ${evidence.billionGet.connections} 个连接 · pipeline=1 · 60 秒窗口。单机结果，请使用实际工作负载复测。`,
            )}
          </p>
        </div>
      </section>

      <section
        id="consolidation"
        className="home-section container"
        aria-labelledby="home-consolidation-title"
      >
        <div className="home-centered-heading">
          <p className="home-eyebrow">
            02 / {t("A SIZING ILLUSTRATION", "容量规划示意")}
          </p>
          <h2 id="home-consolidation-title">
            {t(
              "Imagine 300 nodes becoming 3.",
              "想象一下：300 个节点，变成 3 个。",
            )}
          </h2>
          <p>
            {t(
              "For a cluster expanded to hold more data, higher capacity per node makes a smaller fleet worth evaluating. Start with your capacity needs—and keep your latency target in the acceptance criteria.",
              "如果集群扩容主要是为了容纳更多数据，更高的单节点容量就值得用更小规模的集群来评估。从容量需求出发，同时把延迟目标写入验收标准。",
            )}
          </p>
        </div>
        <ClusterIllustration locale={locale} />
        <div className="home-sizing-facts">
          <div>
            <span>{t("Illustrative Redis capacity", "Redis 示例容量")}</span>
            <strong>300 × 32 GiB</strong>
          </div>
          <span aria-hidden="true">=</span>
          <div>
            <span>{t("Illustrative Lavik capacity", "Lavik 示例容量")}</span>
            <strong>3 × 3,200 GiB</strong>
          </div>
          <div>
            <span>{t("Same aggregate value capacity", "相同的总值容量")}</span>
            <strong>{aggregate}</strong>
          </div>
        </div>
        <p className="home-fine-print home-sizing-note">
          {t(
            "Assumes 100× more usable value capacity per Lavik data node. This is capacity arithmetic, not a tested 300-to-3 migration or a recommended topology. The 100× node-count ratio is separate from the 20× capacity-price ratio. Size the DRAM index, CPU, network, replicas, control plane, recovery headroom, and failure domains for the actual deployment.",
            "假设每个 Lavik 数据节点的可用值容量提高 100 倍。这是容量算式，并非经过测试的 300 到 3 迁移或推荐拓扑。100 倍节点数量比与 20 倍容量单价比分属不同概念。实际部署仍需规划 DRAM 索引、CPU、网络、副本、控制平面、恢复余量与故障域。",
          )}
        </p>
        <div className="home-sla-row">
          <div>
            <p className="home-eyebrow">
              {t("THE ACCEPTANCE TEST", "验收标准")}
            </p>
            <h3>{t("Set the P99.99 SLA first.", "先确定 P99.99 SLA。")}</h3>
            <p>
              {t(
                "Replay your key sizes, command mix, concurrency, expiration, and persistence settings. Measure tail latency under sustained load, replication, and failover before choosing the final node count.",
                "回放实际键值大小、命令组合、并发、过期和持久性设置。在持续负载、复制与故障切换下测量尾延迟，再决定最终节点数。",
              )}
            </p>
            <Link href={`${docs}/migrate-redis-cluster/`}>
              {t(
                "Plan a Redis Cluster evaluation",
                "规划 Redis Cluster 迁移评估",
              )}{" "}
              ↗
            </Link>
          </div>
          <details className="home-tail-details">
            <summary>
              {t(
                "What the current P99.99 results show",
                "当前 P99.99 测量结果",
              )}
            </summary>
            <p>
              {t(
                "At each system’s selected 10M-key throughput peak, GET P99.99 is lower for Lavik; SET P99.99 is slightly higher. These single-server measurements do not establish a cluster SLA.",
                "在各系统选定的千万键吞吐峰值点，Lavik 的 GET P99.99 更低，SET P99.99 略高。这些单机测量不能确立集群 SLA。",
              )}
            </p>
            <table>
              <caption>
                {t(
                  "Measured P99.99 latency, milliseconds",
                  "P99.99 实测延迟，毫秒",
                )}
              </caption>
              <thead>
                <tr>
                  <th>{t("Command", "命令")}</th>
                  <th>Lavik SPDK</th>
                  <th>Redis</th>
                </tr>
              </thead>
              <tbody>
                {evidence.tail.map((row) => (
                  <tr key={row.command}>
                    <th scope="row">{row.command}</th>
                    <td>{row.lavik.p9999}</td>
                    <td>{row.redis.p9999}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <a href={sourceUrl}>
              {t("Measurements and methodology", "测量数据与方法")} ↗
            </a>
          </details>
        </div>
      </section>

      <section
        id="agents"
        className="home-agent-section"
        aria-labelledby="home-agent-title"
      >
        <div className="container">
          <div className="home-agent-grid">
            <div>
              <p className="home-eyebrow">
                03 / {t("THE AGENTIC WORKLOAD", "智能体时代的工作负载")}
              </p>
              <h2 id="home-agent-title">
                {t("Your next users", "你的下一批用户，")}
                <br />
                <em>{t("may be agents.", "可能是智能体。")}</em>
              </h2>
              <p className="home-section-lead">
                {t(
                  "One account can drive many agents, each with its own profile, session context, and feature state. Keeping that expanding state addressable should not force every value into expensive memory.",
                  "一个账户可以驱动多个智能体，每个智能体都有自己的画像、会话上下文和特征状态。让不断增长的状态数据可被快速访问，不应意味着必须把所有值放进昂贵的内存。",
                )}
              </p>
              <p>
                {t(
                  "Lavik gives these applications Redis-compatible key-value building blocks with NVMe SSD value capacity. Your application controls retention, access boundaries, and how agent state is represented.",
                  "Lavik 为这些应用提供 Redis 兼容的键值操作，以及 NVMe SSD 值容量。数据保留策略、访问边界与智能体状态的表示方式，由应用自行定义。",
                )}
              </p>
            </div>
            <AgentCapacity locale={locale} />
          </div>
          <div className="home-agent-cards">
            <article>
              <span>PROFILE / CONTEXT</span>
              <h3>{t("Profiles that multiply", "不断增长的画像")}</h3>
              <p>
                {t(
                  "Store agent preferences, task context, and per-session state as application-defined keys and hashes.",
                  "用应用定义的键与 Hash 保存智能体偏好、任务上下文和会话状态。",
                )}
              </p>
              <Link href={`/${locale}/use-cases/sessions-user-profiles/`}>
                {t("Sessions & profiles", "会话与画像")} ↗
              </Link>
            </article>
            <article>
              <span>ONLINE FEATURES</span>
              <h3>
                {t("More entities. More features.", "更多实体，更多特征。")}
              </h3>
              <p>
                {t(
                  "Serve feature records for people, agents, and application entities using familiar key-based reads and updates.",
                  "通过熟悉的按键读取与更新，为人、智能体和应用实体提供特征记录。",
                )}
              </p>
              <Link href={`/${locale}/use-cases/online-feature-serving/`}>
                {t("Online feature serving", "在线特征服务")} ↗
              </Link>
            </article>
            <article>
              <span>TOOLS / CACHE</span>
              <h3>{t("Room for reusable results", "容纳可复用的结果")}</h3>
              <p>
                {t(
                  "Cache tool responses and intermediate results with application-chosen keys and TTLs. Evaluate hit rates, expiry load, and tail latency together.",
                  "用应用选择的键和 TTL 缓存工具响应及中间结果，同时评估命中率、过期负载与尾延迟。",
                )}
              </p>
              <Link href={`/${locale}/use-cases/large-application-caches/`}>
                {t("Large application caches", "大容量应用缓存")} ↗
              </Link>
            </article>
          </div>
        </div>
      </section>

      <section
        id="open-source"
        className="home-section container home-open-source"
        aria-labelledby="home-open-title"
      >
        <div className="home-license-mark" aria-hidden="true">
          <span>OPEN SOURCE</span>
          <strong>
            Apache
            <br />
            <em>2.0</em>
          </strong>
          <span>BUILD · INSPECT · CONTRIBUTE</span>
        </div>
        <div>
          <p className="home-eyebrow">
            04 / {t("OUR COMMITMENT", "我们的承诺")}
          </p>
          <h2 id="home-open-title">
            {t("Open source.", "坚持开源。")}
            <br />
            {t("Built in the open.", "公开构建。")}
          </h2>
          <p className="home-section-lead">
            {t(
              "We are committed to building Lavik as an open-source project under Apache 2.0. Read the code, use it in your projects, and help shape what comes next.",
              "我们致力于将 Lavik 作为 Apache 2.0 开源项目持续建设。阅读代码，在自己的项目中使用它，并一起决定接下来的方向。",
            )}
          </p>
          <p>
            {t(
              "Source, benchmarks, design documents, and issue discussions are public. Lavik is at 0.1.0-beta.1: start with the versioned manual and bring us your workload, questions, and contributions.",
              "源代码、基准测试、设计文档和问题讨论都公开可见。Lavik 当前为 0.1.0-beta.1：从版本化手册开始，欢迎带来你的工作负载、问题和贡献。",
            )}
          </p>
          <div className="home-link-row">
            <a href="https://github.com/eloqdata/lavik">
              {t("Explore the source", "查看源码")} ↗
            </a>
            <a href="https://github.com/eloqdata/lavik/blob/v0.1.0-beta.1/LICENSE">
              {t("Read the license", "阅读许可证")} ↗
            </a>
            <Link href={`/${locale}/community/`}>
              {t("Join the community", "加入社区")} ↗
            </Link>
          </div>
          <p className="home-fine-print">
            {t(
              "EloqData-authored code: Apache 2.0. Third-party components retain their own licenses and notices.",
              "EloqData 编写的代码采用 Apache 2.0；第三方组件保留各自的许可证和声明。",
            )}
          </p>
        </div>
      </section>

      <section
        className="home-section container home-evaluate"
        aria-labelledby="home-evaluate-title"
      >
        <div className="home-split-heading">
          <div>
            <p className="home-eyebrow">05 / {t("YOUR NEXT STEP", "下一步")}</p>
            <h2 id="home-evaluate-title">
              {t("Put your workload", "让你的工作负载，")}
              <br />
              <em>{t("on Lavik.", "运行在 Lavik 上。")}</em>
            </h2>
          </div>
          <p className="home-section-lead">
            {t(
              "Start small, verify compatibility, then measure the capacity and latency that matter to your application.",
              "从小规模开始，确认兼容性，再测量对应用真正重要的容量与延迟。",
            )}
          </p>
        </div>
        <div className="home-three-cards">
          <article>
            <span className="home-card-number">01 / INSTALL</span>
            <h3>{t("Run your first node", "运行第一个节点")}</h3>
            <p>
              {t(
                "Choose a binary, an APT package, Docker, or Docker Compose. Start with the versioned installation guide.",
                "选择二进制、APT 软件包、Docker 或 Docker Compose，从版本化安装指南开始。",
              )}
            </p>
            <Link href={`/${locale}/download/`}>
              {t("Download Lavik", "下载 Lavik")} ↗
            </Link>
          </article>
          <article>
            <span className="home-card-number">02 / VALIDATE</span>
            <h3>{t("Bring your Redis client", "带上你的 Redis 客户端")}</h3>
            <p>
              {t(
                "Check tested client versions and command coverage, then exercise your application’s actual reads, writes, scripts, and expiry behavior.",
                "核对已测试的客户端版本和命令覆盖范围，再运行应用真实的读写、脚本与过期逻辑。",
              )}
            </p>
            <Link href={`${docs}/clients/`}>
              {t("Client compatibility", "客户端兼容性")} ↗
            </Link>
          </article>
          <article>
            <span className="home-card-number">03 / EVALUATE</span>
            <h3>{t("Plan your migration", "规划迁移")}</h3>
            <p>
              {t(
                "Rehearse the data transfer, replication, failure handling, and rollback path. Accept the new deployment against your workload and SLA.",
                "演练数据传输、复制、故障处理与回滚路径，再按实际工作负载和 SLA 验收新部署。",
              )}
            </p>
            <Link href={`${docs}/migrate-redis/`}>
              {t("Migrate from Redis", "从 Redis 迁移")} ↗
            </Link>
          </article>
        </div>
        <div className="home-final-cta">
          <strong>
            {t(
              "Redis-compatible. NVMe SSD capacity. Apache 2.0.",
              "Redis 兼容。NVMe SSD 容量。Apache 2.0。",
            )}
          </strong>
          <Link href={`${docs}/quick-start/`}>
            {t("Start with Lavik", "开始使用 Lavik")}{" "}
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
