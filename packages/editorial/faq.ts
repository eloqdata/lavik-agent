import type { Locale } from "../content/schema";
const t = (en: string, zh: string) => ({ en, "zh-CN": zh });
export const adoptionFaq = [
  {
    question: t("What is Lavik?", "Lavik 是什么？"),
    answer: t(
      "Lavik is an Apache 2.0 Redis-compatible key-value store. It keeps a compact key index in DRAM and stores values on NVMe SSD, combining familiar Redis commands with much lower value-capacity cost. The current release is 0.1.0.",
      "Lavik 是 Apache 2.0 开源的 Redis 兼容键值存储。它在 DRAM 中保存紧凑的键索引，将值存于 NVMe SSD，兼具熟悉的 Redis 命令与更低的值容量成本。当前版本为 0.1.0。",
    ),
    path: "about",
    link: t("About Lavik", "关于 Lavik"),
  },
  {
    question: t(
      "Can SSD-backed Lavik outperform Redis in DRAM?",
      "基于 SSD 的 Lavik 能超越 DRAM 上的 Redis 吗？",
    ),
    answer: t(
      "Yes, in the published 16-vCPU SPDK test. At 10 million keys with 1 KiB values, Lavik 0.1.0 reaches 1,145.8k peak GET QPS and 972.0k peak SET QPS, above the tested Redis 8.10.2 and Valkey 9.1.2 configurations. The report includes the connection sweep, p99.9 latency, settings and reproduction commands.",
      "可以，在已发布的 16 vCPU SPDK 测试中，1,000 万键、1 KiB 值下，Lavik 0.1.0 达到 1,145.8k GET 峰值 QPS 与 972.0k SET 峰值 QPS，高于受测 Redis 8.10.2 和 Valkey 9.1.2 配置。报告包含连接数扫描、p99.9 延迟、配置与复现命令。",
    ),
    path: "benchmarks/redis-valkey",
    link: t("See the benchmark", "查看基准测试"),
  },
  {
    question: t(
      "What does 20× lower capacity cost mean?",
      "值容量成本降至 1/20 是什么意思？",
    ),
    answer: t(
      "If DRAM costs 20 times as much per GiB as NVMe SSD, the same value payload costs 95% less in storage media on SSD. Lavik still needs memory for its index and runtime. Add replicas, CPU, networking and operations to compare complete deployments; the calculator lets you enter your own prices.",
      "如果 DRAM 每 GiB 单价是 NVMe SSD 的 20 倍，相同值数据在 SSD 上的介质容量成本就降低 95%。Lavik 仍需索引与运行时内存。比较完整部署时还需计入副本、CPU、网络与运维；计算器支持输入实际价格。",
    ),
    path: "cost",
    link: t("Calculate your costs", "计算你的成本"),
  },
  {
    question: t(
      "Can I keep my Redis client and data structures?",
      "能继续使用 Redis 客户端和数据结构吗？",
    ),
    answer: t(
      "Lavik supports RESP2 and RESP3 and Redis data structures including strings, hashes, sets, lists, sorted sets and streams. The 0.1.0 manual lists command behavior and tested client versions. Match the commands and connection mode your application uses before switching its endpoint.",
      "Lavik 支持 RESP2、RESP3，以及 String、Hash、Set、List、Sorted Set、Stream 等 Redis 数据结构。0.1.0 手册列出命令行为与实测客户端版本。切换连接地址前，核对应用使用的命令和连接模式。",
    ),
    path: "docs/0.1.0/compatibility",
    link: t("Check compatibility", "查看兼容性"),
  },
  {
    question: t(
      "What is the quickest way to try Lavik?",
      "怎样最快开始使用 Lavik？",
    ),
    answer: t(
      "Use the Docker guide for a first instance, or install the Linux package for a host deployment. Both Minimal and Standard release archives are available for AMD64 and ARM64; Standard includes SPDK support. The quick start takes you from download to your first Redis-compatible commands.",
      "可按 Docker 指南启动首个实例，或使用 Linux 软件包部署到主机。AMD64 与 ARM64 均提供 Minimal 和 Standard 发布包；Standard 包含 SPDK 支持。快速入门覆盖从下载到执行首批 Redis 兼容命令的步骤。",
    ),
    path: "docs/0.1.0/quick-start",
    link: t("Start with Lavik 0.1.0", "开始使用 Lavik 0.1.0"),
  },
  {
    question: t(
      "How do I migrate from Redis or Redis Cluster?",
      "如何从 Redis 或 Redis Cluster 迁移？",
    ),
    answer: t(
      "Use RedisShake v4.6.2 with a fresh managed Lavik target. The guide provides source and target configurations, full copy, incremental catch-up, a final write pause, data checks and endpoint cutover. Source and target shard counts can differ.",
      "使用 RedisShake v4.6.2 将数据迁移到全新的托管 Lavik 目标。指南提供源与目标配置、全量复制、增量追平、最终暂停写入、数据检查及连接切换步骤。源与目标分片数可以不同。",
    ),
    path: "docs/0.1.0/migrate-redis",
    link: t("Follow the migration guide", "查看迁移步骤"),
  },
  {
    question: t(
      "How do I operate and monitor Lavik?",
      "如何运维与监控 Lavik？",
    ),
    answer: t(
      "The release includes lavik, lavik-meta, lavik-ctl and Lavik Admin. Use the managed-deployment guides for topology, replication and failover, and the monitoring guide for Prometheus and Grafana. Choose Single or Cluster mode to match your application’s routing requirements.",
      "发布包包含 lavik、lavik-meta、lavik-ctl 与 Lavik Admin。托管部署指南介绍拓扑、复制与故障切换，监控指南介绍 Prometheus 与 Grafana。根据应用路由要求选择 Single 或 Cluster 模式。",
    ),
    path: "docs/0.1.0",
    link: t("Read the operations guides", "阅读运维指南"),
  },
  {
    question: t(
      "Is Lavik free to use in a commercial application?",
      "商业应用可以免费使用 Lavik 吗？",
    ),
    answer: t(
      "Yes. Lavik is open source under Apache 2.0. The source, architecture documents and benchmark procedures are public. You can use it in your projects, contribute improvements and discuss your workload with the community.",
      "可以。Lavik 以 Apache 2.0 协议开源，源代码、架构文档和基准测试步骤均公开。欢迎在项目中使用、贡献改进，并与社区讨论你的工作负载。",
    ),
    path: "community",
    link: t("Join the community", "加入社区"),
  },
];
export const faqFor = (locale: Locale) =>
  adoptionFaq.map((f) => ({
    question: f.question[locale],
    answer: f.answer[locale],
    path: f.path,
    link: f.link[locale],
  }));
