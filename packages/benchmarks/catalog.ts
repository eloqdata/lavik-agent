import type { Locale } from "../content/schema";
export type Localized = Record<Locale, string>;
export type BenchmarkReport = {
  id: string;
  directory: string;
  date: string;
  label: Localized;
  title: Localized;
  summary: Localized;
  takeaway: Localized;
  scope: Localized;
  caveat: Localized;
  stats: { value: string; label: Localized }[];
  steps: Localized[];
};
const t = (en: string, zh: string): Localized => ({ en, "zh-CN": zh });
export const benchmarkReports: BenchmarkReport[] = [
  {
    id: "2vcpu-capacity",
    directory: "lavik-v0.1.0-2vcpu-latest-capacity-2026-10-13",
    date: "2026-10-13",
    label: t("Redis & Valkey: Compact Instances", "Redis 与 Valkey：小型实例"),
    title: t(
      "Lavik vs Redis & Valkey on Compact Instances",
      "小型实例上的 Lavik、Redis 与 Valkey 对比",
    ),
    summary: t(
      "Compare Lavik, Redis 8.10.2 and Valkey 9.1.2 at 1M keys on a 2-vCPU, 16 GiB VM, then explore Lavik’s NVMe SSD capacity at 100M keys on the same instance.",
      "在 2 vCPU、16 GiB 内存的虚拟机上，对比 Lavik、Redis 8.10.2 与 Valkey 9.1.2 的 100 万键表现，再测试 Lavik 在同一实例上通过 NVMe SSD 承载 1 亿键的能力。",
    ),
    takeaway: t(
      "With 100× the keys, Lavik retains essentially all peak GET throughput and 95.2% of peak SET throughput. Its 95.37 GiB value payload is about six times the VM’s nominal RAM.",
      "键数扩大 100 倍后，Lavik 的 GET 峰值吞吐量基本不变，SET 保留 95.2%；95.37 GiB 的值负载约为虚拟机标称内存的六倍。",
    ),
    scope: t(
      "Azure L2aos_v5 · 2 vCPUs / 1 physical core · 16 GiB nominal RAM · 1 KiB values · SPDK · pipeline 1 · 30 s per point",
      "Azure L2aos_v5 · 2 vCPU / 1 个物理核 · 标称 16 GiB 内存 · 1 KiB 值 · SPDK · pipeline 1 · 每点 30 秒",
    ),
    caveat: t(
      "Valkey has the highest 1M-key GET peak: 226,514 ops/s. Lavik’s higher SET peak uses 640 connections; at 160 connections Valkey has slightly higher SET throughput and lower p99.9. Peak retention compares independently selected peaks. Redis and Valkey were not tested at 100M keys.",
      "Valkey 的 100 万键 GET 峰值最高，为 226,514 ops/s。Lavik 更高的 SET 峰值使用 640 个连接；在 160 个连接时，Valkey 的 SET 吞吐量略高且 p99.9 更低。保留率比较各自选定的峰值；Redis 和 Valkey 未测试 1 亿键。",
    ),
    stats: [
      {
        value: "95.37 GiB",
        label: t("Value payload on a 16 GiB VM", "16 GiB 虚拟机上的值负载"),
      },
      {
        value: "215,463",
        label: t("100M-key peak GET ops/s", "1 亿键 GET 峰值 ops/s"),
      },
      {
        value: "195,879",
        label: t("100M-key peak SET ops/s", "1 亿键 SET 峰值 ops/s"),
      },
    ],
    steps: [
      t(
        "Provision the 2-vCPU server and a separate 16-core client. Install the pinned releases and memtier 2.5.1; record the original host settings.",
        "准备 2 vCPU 服务端与独立 16 核客户端，安装指定发布版及 memtier 2.5.1，记录原始主机设置。",
      ),
      t(
        "Prepare one verified empty NVMe namespace for SPDK and reserve 2 GiB hugepages. Load the 1M and 100M Lavik datasets independently.",
        "为 SPDK 准备一个已核验的空 NVMe 命名空间及 2 GiB 大页，独立加载 Lavik 的 100 万键和 1 亿键数据集。",
      ),
      t(
        "Run Redis and Valkey one at a time with 1 and 2 I/O threads, resetting from each product’s saved baseline RDB.",
        "逐一测试 Redis、Valkey 的 1 和 2 个 I/O 线程配置，每次从对应产品的基线 RDB 恢复。",
      ),
      t(
        "Check exact counts and sampled lengths, warm up for 10 seconds, then measure GET and SET at 16–1280 connections. Verify zero misses/errors and restore host/device settings.",
        "核验精确键数与抽样长度，预热 10 秒，在 16–1280 个连接下测量 GET 和 SET；确认无未命中、无连接错误，并恢复主机及设备设置。",
      ),
    ],
  },
  {
    id: "redis-valkey",
    directory: "lavik-v0.1.0-spdk-vs-latest-2026-10-13",
    date: "2026-10-13",
    label: t("Redis & Valkey: High Throughput", "Redis 与 Valkey：高吞吐量"),
    title: t(
      "Lavik vs Redis & Valkey for High Throughput",
      "高吞吐量场景下的 Lavik、Redis 与 Valkey 对比",
    ),
    summary: t(
      "Compare Lavik 0.1.0 SPDK on NVMe SSD with Redis 8.10.2 and Valkey 9.1.2 on DRAM at 10M keys using a 16-vCPU VM, plus a separate billion-key Lavik capacity sweep.",
      "使用 16 vCPU 虚拟机，在 1,000 万键下对比 NVMe SSD 上的 Lavik 0.1.0 SPDK 与 DRAM 上的 Redis 8.10.2、Valkey 9.1.2，并独立测试 Lavik 的十亿键容量。",
    ),
    takeaway: t(
      "Lavik reaches 1,145.8k peak GET QPS and 972.0k peak SET QPS at 10M keys. The separate 1B-key sweep reaches 1,069,126 GET QPS with values on NVMe SSD.",
      "在 1,000 万键下，Lavik 达到 1,145.8k GET 峰值 QPS 和 972.0k SET 峰值 QPS。独立的十亿键测试在 NVMe SSD 上达到 1,069,126 GET QPS。",
    ),
    scope: t(
      "Azure L16aos_v4 · 16 logical CPUs / 8 physical cores · six NVMe SSDs · 1 KiB values · pipeline 1 · 120 formal points",
      "Azure L16aos_v4 · 16 个逻辑 CPU / 8 个物理核 · 六块 NVMe SSD · 1 KiB 值 · pipeline 1 · 120 个正式测试点",
    ),
    caveat: t(
      "The 10M-key group uses 30-second windows and default correlated seeds; the Lavik-only 1B-key group uses 60 seconds and distinct seeds. Memory peers disable AOF and scheduled snapshots. Each point is measured once; persistence and workload conditions must accompany any comparison.",
      "1,000 万键组使用 30 秒窗口和默认相关种子；仅 Lavik 的十亿键组使用 60 秒和独立种子。内存对照关闭 AOF 与定时快照。每点仅测一次，比较时需同时考虑持久化和负载条件。",
    ),
    stats: [
      {
        value: "1,145.8k",
        label: t(
          "10M-key GET QPS · p99.9 7.135 ms",
          "1,000 万键 GET QPS · p99.9 7.135 ms",
        ),
      },
      {
        value: "972.0k",
        label: t(
          "10M-key SET QPS · p99.9 7.199 ms",
          "1,000 万键 SET QPS · p99.9 7.199 ms",
        ),
      },
      {
        value: "1,069,126",
        label: t(
          "1B-key GET QPS · 640 connections",
          "十亿键 GET QPS · 640 个连接",
        ),
      },
    ],
    steps: [
      t(
        "Prepare the two benchmark VMs, the standard Lavik 0.1.0 package, pinned Redis/Valkey releases, and memtier 2.5.1.",
        "准备两台测试虚拟机、Lavik 0.1.0 Standard 发布包、指定 Redis/Valkey 版本及 memtier 2.5.1。",
      ),
      t(
        "Verify six empty scratch NVMe devices, bind them for SPDK, and reserve 8 GiB hugepages. Independently load the 10M and 1B Lavik datasets; keep defrag enabled.",
        "核验六块空测试 NVMe，绑定至 SPDK 并预留 8 GiB 大页；分别独立加载 1,000 万键与十亿键 Lavik 数据集，保持碎片整理开启。",
      ),
      t(
        "Build the memory peers with jemalloc 5.3.0. Save one baseline RDB per product, then test 1/2/4/8/16 I/O threads with AOF and scheduled snapshots off.",
        "使用 jemalloc 5.3.0 构建内存对照。每个产品保存一份基线 RDB，关闭 AOF、定时快照后测试 1/2/4/8/16 个 I/O 线程。",
      ),
      t(
        "Run the supplied 80–1280 connection sweeps with the correct dataset-specific duration, seed and warmup policy. Check counts, value lengths, misses and errors.",
        "按对应数据集的时长、种子与预热策略执行 80–1280 个连接测试，核验键数、值长度、未命中及错误。",
      ),
    ],
  },
  {
    id: "1tb-storage",
    directory: "lavik-v0.1.0-storage-peers-1tb-2026-10-14",
    date: "2026-10-14",
    label: t("Redis-Compatible Databases on SSD", "SSD 上的 Redis 兼容数据库"),
    title: t(
      "Lavik vs Redis-Compatible Databases on SSD",
      "Lavik 与采用 SSD 的 Redis 兼容数据库对比",
    ),
    summary: t(
      "Compare Lavik with Dragonfly, Garnet, Apache Kvrocks, Pika and Tendis using their SSD-backed storage paths: one billion keys, a 1.024 TB raw value payload, matched concurrency and p99.9 curves.",
      "对比 Lavik 与 Dragonfly、Garnet、Apache Kvrocks、Pika、Tendis 使用 SSD 存储时的表现：十亿键、1.024 TB 原始值负载、相同连接数及 p99.9 曲线。",
    ),
    takeaway: t(
      "Lavik records the highest GET peak: 1,069,126 QPS. At 80 connections it delivers 385,514 GET QPS at 0.439 ms p99.9, and 425,907 SET QPS at 2.655 ms p99.9.",
      "Lavik 的 GET 峰值最高，达到 1,069,126 QPS。在 80 个连接下，GET 为 385,514 QPS、p99.9 0.439 ms；SET 为 425,907 QPS、p99.9 2.655 ms。",
    ),
    scope: t(
      "1B keys × 1 KiB · 16 vCPUs · six NVMe SSDs · SPDK vs RAID0/XFS peers · pipeline 1 · 60 s per point",
      "十亿键 × 1 KiB · 16 vCPU · 六块 NVMe SSD · SPDK 对比 RAID0/XFS 对照 · pipeline 1 · 每点 60 秒",
    ),
    caveat: t(
      "Garnet has the highest full-sweep SET peak at 900,794 QPS. At 80 connections, Tendis and Kvrocks have lower SET p99.9 than Lavik. Warmups, memory budgets and persistence differ; configured cache budgets are not measured RSS. The 1 TB label excludes keys and storage/index overhead.",
      "Garnet 的全连接扫描 SET 峰值最高，为 900,794 QPS。在 80 个连接下，Tendis 和 Kvrocks 的 SET p99.9 低于 Lavik。预热、内存预算与持久化各不相同；缓存配置不等于实测 RSS。1 TB 标注不包含键及存储、索引开销。",
    ),
    stats: [
      {
        value: "1,069,126",
        label: t("Lavik peak GET QPS", "Lavik GET 峰值 QPS"),
      },
      {
        value: "0.439 ms",
        label: t(
          "Lavik GET p99.9 · 80 connections",
          "Lavik GET p99.9 · 80 个连接",
        ),
      },
      {
        value: "6",
        label: t("Storage-backed systems tested", "种受测存储方案"),
      },
    ],
    steps: [
      t(
        "Install all six pinned releases and memtier 2.5.1. Use one database at a time on the same 16-vCPU server with a separate client.",
        "安装六种指定发布版及 memtier 2.5.1。在同一台 16 vCPU 服务端逐一运行数据库，使用独立客户端。",
      ),
      t(
        "Verify dedicated empty devices. Prepare SPDK and 8 GiB hugepages for Lavik; use the report’s RAID0/XFS setup for filesystem peers.",
        "核验专用空设备，为 Lavik 准备 SPDK 和 8 GiB 大页；文件系统对照使用报告的 RAID0/XFS 配置。",
      ),
      t(
        "Save the Kvrocks/Pika/Tendis override blocks as named files and apply the supplied overlay script to their release configuration templates.",
        "将 Kvrocks/Pika/Tendis 覆盖配置保存为指定文件，使用提供的脚本叠加至各发布版配置模板。",
      ),
      t(
        "Load one billion keys independently per system. Apply the specified Dragonfly/Garnet warmup, sweep 80–1280 connections, and reconcile sampled lengths, successful operations, misses and errors.",
        "每种系统独立加载十亿键，按要求对 Dragonfly/Garnet 预热，测试 80–1280 个连接，并核对抽样长度、成功操作数、未命中及错误。",
      ),
    ],
  },
  {
    id: "aerospike-ycsb",
    directory: "lavik-v0.1.0-aerospike-ycsb-2026-10-13",
    date: "2026-10-13",
    label: t("Lavik vs Aerospike", "Lavik 与 Aerospike"),
    title: t("Lavik vs Aerospike", "Lavik 与 Aerospike 对比"),
    summary: t(
      "100M records, ten fields per record, four YCSB workload mixes, and both a 100K target rate and unlimited throughput.",
      "1 亿条记录，每条十个字段，覆盖四种 YCSB 负载组合，以及 100K 目标速率和不限速两种场景。",
    ),
    takeaway: t(
      "Lavik’s unlimited total throughput is 4.36%–28.76% higher across the four measured workloads. In read-only C it reaches 593,911 QPS with 1.556 ms READ p99.9.",
      "四种实测负载中，Lavik 不限速总吞吐量高出 4.36%–28.76%。纯读 C 达到 593,911 QPS，READ p99.9 为 1.556 ms。",
    ),
    scope: t(
      "100M records × 10 × 128 B fields · Aerospike CE 8.1.2.4-4 · Lavik io_uring · raw RAID0 partitions · 256 YCSB workers · 300 s per window",
      "1 亿记录 × 10 × 128 B 字段 · Aerospike CE 8.1.2.4-4 · Lavik io_uring · 原始 RAID0 分区 · 256 个 YCSB 工作线程 · 每窗口 300 秒",
    ),
    caveat: t(
      "Aerospike has lower per-operation p99.9 at the 100K target and in unlimited workload A. Lavik uses 12 workers plus 4 system/IRQ CPUs; Aerospike retains its default performance settings and original host policy. D uses uniform reads over the original keys, not standard latest-key YCSB D. This is a comparison of these deployments, not an isolated engine variable.",
      "在 100K 目标速率和不限速 A 中，Aerospike 的各操作 p99.9 更低。Lavik 使用 12 个工作线程及 4 个系统/IRQ CPU；Aerospike 保留默认性能配置和原主机策略。D 均匀读取原始键，非标准 YCSB D 的最新键分布。结果比较这两种部署，并非仅隔离引擎单一变量。",
    ),
    stats: [
      {
        value: "+28.76%",
        label: t("Unlimited read-only C throughput", "不限速纯读 C 吞吐量提升"),
      },
      {
        value: "593,911",
        label: t(
          "Lavik C QPS · READ p99.9 1.556 ms",
          "Lavik C QPS · READ p99.9 1.556 ms",
        ),
      },
      {
        value: "16",
        label: t("Measured 300-second windows", "个 300 秒测量窗口"),
      },
    ],
    steps: [
      t(
        "Prepare two separate empty raw RAID0 partitions and the pinned database packages. Install Java 17 and the report’s custom YCSB commit; apply the documented HREPLACE binding rename before building.",
        "准备两个独立空原始 RAID0 分区及指定数据库发布包。安装 Java 17 和报告指定的自定义 YCSB 提交，构建前完成所述 HREPLACE 绑定重命名。",
      ),
      t(
        "Run Aerospike first under the original host policy. Load 100M records, stop cleanly, recover, and verify server counts plus all ten fields in sampled records.",
        "先在原主机策略下运行 Aerospike，加载 1 亿记录，干净停止、恢复，并核验服务端记录数及抽样记录的全部十个字段。",
      ),
      t(
        "Run C/A/B/D-Uniform, 100K then unlimited, with a separate warmup JVM and 300-second measurement JVM. Retain ordinary whole-window HDR histograms and error counters.",
        "按 C/A/B/D-Uniform 顺序，每种先 100K 后不限速，分别使用预热 JVM 和 300 秒测量 JVM；保留普通完整窗口 HDR 直方图与错误计数。",
      ),
      t(
        "Stop Aerospike, apply Lavik’s documented 12+4 CPU/IRQ isolation, independently load and recover Lavik, then repeat the matrix. Restore the original host policy afterward.",
        "停止 Aerospike，应用 Lavik 文档中的 12+4 CPU/IRQ 隔离，独立加载并恢复 Lavik，再重复测试矩阵，最后恢复原主机策略。",
      ),
    ],
  },
];
export const benchmarkRoute = (id: string) => "benchmarks/" + id;
export const benchmarkForRoute = (route: string) =>
  benchmarkReports.find((r) => benchmarkRoute(r.id) === route);
