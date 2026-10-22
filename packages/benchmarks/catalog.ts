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
export const benchmarkReports: BenchmarkReport[] = [
  {
    id: "2vcpu-capacity",
    directory: "lavik-v0.2.0-vs-memory-databases-2026-10-21",
    date: "2026-10-21",
    label: {
      en: "Redis & Valkey: Compact Instances",
      "zh-CN": "Redis 与 Valkey：小型实例",
    },
    title: {
      en: "Lavik vs Redis & Valkey on Compact Instances",
      "zh-CN": "小型实例上的 Lavik、Redis 与 Valkey 对比",
    },
    summary: {
      en: "Compare Lavik, Redis 8.10.2 and Valkey 9.1.2 at 1M keys on a 2-vCPU, 16 GiB VM, then explore Lavik’s NVMe SSD capacity at 100M keys on the same instance.",
      "zh-CN":
        "在 2 vCPU、16 GiB 内存的虚拟机上，对比 Lavik、Redis 8.10.2 与 Valkey 9.1.2 的 100 万键表现，再测试 Lavik 在同一实例上通过 NVMe SSD 承载 1 亿键的能力。",
    },
    takeaway: {
      en: "At 100M keys, Lavik reaches 215,644 peak GET ops/s and 231,361 peak SET ops/s, retaining 100.0% and 96.6% of its 1M-key peaks. The 95.37 GiB logical value payload is about six times nominal RAM.",
      "zh-CN":
        "在 1 亿键下，Lavik 达到 215,644 GET 与 231,361 SET 峰值 ops/s，分别保留 100 万键峰值的 100.0% 与 96.6%；95.37 GiB 逻辑值负载约为标称内存的六倍。",
    },
    scope: {
      en: "Azure L2aos_v5 · 2 vCPUs / 1 physical core · 16 GiB nominal RAM · 1 KiB values · SPDK · pipeline 1 · 30 s per point",
      "zh-CN":
        "Azure L2aos_v5 · 2 vCPU / 1 个物理核 · 标称 16 GiB 内存 · 1 KiB 值 · SPDK · pipeline 1 · 每点 30 秒",
    },
    caveat: {
      en: "Valkey leads the 1M-key GET peak at 245,955 ops/s. Lavik leads the 1M-key SET peak at 239,405 ops/s. Peaks occur at different connection counts; compare paired p99.9 and matched-concurrency rows. Redis and Valkey use 1M keys only.",
      "zh-CN":
        "Valkey 的 100 万键 GET 峰值最高，为 245,955 ops/s；Lavik 的 SET 峰值最高，为 239,405 ops/s。各峰值连接数不同，请结合配对 p99.9 与同连接数结果。Redis 与 Valkey 仅测试 100 万键。",
    },
    stats: [
      {
        value: "95.37 GiB",
        label: {
          en: "Value payload on a 16 GiB VM",
          "zh-CN": "16 GiB 虚拟机上的值负载",
        },
      },
      {
        value: "215,644",
        label: {
          en: "100M-key peak GET ops/s",
          "zh-CN": "1 亿键 GET 峰值 ops/s",
        },
      },
      {
        value: "231,361",
        label: {
          en: "100M-key peak SET ops/s",
          "zh-CN": "1 亿键 SET 峰值 ops/s",
        },
      },
    ],
    steps: [
      {
        en: "Provision the 2-vCPU server and a separate 16-core client. Install the pinned releases and memtier 2.5.1; record the original host settings.",
        "zh-CN":
          "准备 2 vCPU 服务端与独立 16 核客户端，安装指定发布版及 memtier 2.5.1，记录原始主机设置。",
      },
      {
        en: "Prepare one verified empty NVMe namespace for SPDK and reserve 2 GiB hugepages. Load the 1M and 100M Lavik datasets independently.",
        "zh-CN":
          "为 SPDK 准备一个已核验的空 NVMe 命名空间及 2 GiB 大页，独立加载 Lavik 的 100 万键和 1 亿键数据集。",
      },
      {
        en: "Run Redis and Valkey one at a time with 1 and 2 I/O threads, resetting from each product’s saved baseline RDB.",
        "zh-CN":
          "逐一测试 Redis、Valkey 的 1 和 2 个 I/O 线程配置，每次从对应产品的基线 RDB 恢复。",
      },
      {
        en: "Check exact counts and sampled lengths, warm up for 10 seconds, then measure GET and SET at 16–1280 connections. Verify zero misses/errors and restore host/device settings.",
        "zh-CN":
          "核验精确键数与抽样长度，预热 10 秒，在 16–1280 个连接下测量 GET 和 SET；确认无未命中、无连接错误，并恢复主机及设备设置。",
      },
    ],
  },
  {
    id: "redis-valkey",
    directory: "lavik-v0.2.0-vs-memory-databases-2026-10-21",
    date: "2026-10-21",
    label: {
      en: "Redis & Valkey: High Throughput",
      "zh-CN": "Redis 与 Valkey：高吞吐量",
    },
    title: {
      en: "Lavik vs Redis & Valkey for High Throughput",
      "zh-CN": "高吞吐量场景下的 Lavik、Redis 与 Valkey 对比",
    },
    summary: {
      en: "Compare Lavik 0.2.0 SPDK on NVMe SSD with Redis 8.10.2 and Valkey 9.1.2 on DRAM at 10M keys using a 16-vCPU VM, plus a separate billion-key Lavik capacity sweep.",
      "zh-CN":
        "使用 16 vCPU 虚拟机，在 1,000 万键下对比 NVMe SSD 上的 Lavik 0.2.0 SPDK 与 DRAM 上的 Redis 8.10.2、Valkey 9.1.2，并独立测试 Lavik 的十亿键容量。",
    },
    takeaway: {
      en: "Lavik reaches 1,156,956 peak GET QPS and 945,384 peak SET QPS at 10M keys. The separate 1B-key sweep reaches 1,129,597 GET QPS and 910,356 SET QPS.",
      "zh-CN":
        "1,000 万键下，Lavik 达到 1,156,956 GET 与 945,384 SET 峰值 QPS；独立十亿键扫描达到 1,129,597 GET 与 910,356 SET QPS。",
    },
    scope: {
      en: "Azure L16aos_v4 · 16 logical CPUs / 8 physical cores · six NVMe SSDs · 1 KiB values · pipeline 1 · 160–1280 connections",
      "zh-CN":
        "Azure L16aos_v4 · 16 逻辑 CPU / 8 物理核 · 六块 NVMe SSD · 1 KiB 值 · pipeline 1 · 160–1280 连接",
    },
    caveat: {
      en: "The 10M group uses 16 client threads and 30-second windows; 1B uses 32 threads and 60 seconds. Each curve uses one fixed worker/I/O-thread setting. Redis/Valkey disable AOF and scheduled snapshots. Latency is paired with throughput at the same point; peak SET does not imply the lowest latency.",
      "zh-CN":
        "1,000 万键组使用 16 客户端线程与 30 秒窗口；十亿键组使用 32 线程与 60 秒。每条曲线采用固定 worker/I/O 线程设置。Redis/Valkey 关闭 AOF 与定时快照；延迟与吞吐量取自同点，SET 峰值不代表最低延迟。",
    },
    stats: [
      {
        value: "1,156,956",
        label: {
          en: "10M-key GET QPS · p99.9 7.103 ms",
          "zh-CN": "1,000 万键 GET QPS · p99.9 7.103 ms",
        },
      },
      {
        value: "945,384",
        label: {
          en: "10M-key SET QPS · p99.9 10.175 ms",
          "zh-CN": "1,000 万键 SET QPS · p99.9 10.175 ms",
        },
      },
      {
        value: "1,129,597",
        label: {
          en: "1B-key GET QPS · 1,280 connections",
          "zh-CN": "十亿键 GET QPS · 1,280 连接",
        },
      },
    ],
    steps: [
      {
        en: "Prepare the two benchmark VMs, the standard Lavik 0.2.0 package, pinned Redis/Valkey releases, and memtier 2.5.1.",
        "zh-CN":
          "准备两台测试虚拟机、Lavik 0.2.0 Standard 发布包、指定 Redis/Valkey 版本及 memtier 2.5.1。",
      },
      {
        en: "Verify six empty scratch NVMe devices, bind them for SPDK, and reserve 8 GiB hugepages. Independently load the 10M and 1B Lavik datasets; keep defrag enabled.",
        "zh-CN":
          "核验六块空测试 NVMe，绑定至 SPDK 并预留 8 GiB 大页；分别独立加载 1,000 万键与十亿键 Lavik 数据集，保持碎片整理开启。",
      },
      {
        en: "Build the memory peers with jemalloc 5.3.0. Save one baseline RDB per product, then test 1/2/4/8/16 I/O threads with AOF and scheduled snapshots off.",
        "zh-CN":
          "使用 jemalloc 5.3.0 构建内存对照。每个产品保存一份基线 RDB，关闭 AOF、定时快照后测试 1/2/4/8/16 个 I/O 线程。",
      },
      {
        en: "Run the supplied 160–1280 connection sweeps with the correct dataset-specific duration, seed and warmup policy. Check counts, value lengths, misses and errors.",
        "zh-CN":
          "按对应数据集的时长、种子与预热策略执行 160–1280 个连接测试，核验键数、值长度、未命中及错误。",
      },
    ],
  },
  {
    id: "1tb-storage",
    directory: "lavik-v0.2.0-storage-peers-1tb-2026-10-21",
    date: "2026-10-21",
    label: {
      en: "Redis-Compatible Databases on SSD",
      "zh-CN": "SSD 上的 Redis 兼容数据库",
    },
    title: {
      en: "Lavik vs Redis-Compatible Databases on SSD",
      "zh-CN": "Lavik 与采用 SSD 的 Redis 兼容数据库对比",
    },
    summary: {
      en: "Compare Lavik with Dragonfly, Garnet, Apache Kvrocks, Pika and Tendis using their SSD-backed storage paths: one billion keys, a 1.024 TB raw value payload, matched concurrency and p99.9 curves.",
      "zh-CN":
        "对比 Lavik 与 Dragonfly、Garnet、Apache Kvrocks、Pika、Tendis 使用 SSD 存储时的表现：十亿键、1.024 TB 原始值负载、相同连接数及 p99.9 曲线。",
    },
    takeaway: {
      en: "Lavik records the highest GET and SET sweep peaks: 1,129,597 and 910,356 QPS. At 320 connections, it delivers 652,881 GET QPS at 0.943 ms p99.9 and 701,241 SET QPS at 0.959 ms.",
      "zh-CN":
        "Lavik 的 GET 与 SET 扫描峰值最高，分别为 1,129,597 与 910,356 QPS。320 连接时，GET 为 652,881 QPS、p99.9 0.943 ms；SET 为 701,241 QPS、0.959 ms。",
    },
    scope: {
      en: "1B keys × 1 KiB · 16 vCPUs · six NVMe SSDs · SPDK vs RAID0/XFS · 32 client threads · 160–1280 connections · 60 s per point",
      "zh-CN":
        "十亿键 × 1 KiB · 16 vCPU · 六块 NVMe SSD · SPDK 对比 RAID0/XFS · 32 客户端线程 · 160–1280 连接 · 每点 60 秒",
    },
    caveat: {
      en: "Garnet leads GET at 160 connections: 419,982 versus Lavik’s 375,966 QPS. Lavik has the lowest p99.9 at every matched GET/SET point in this run. Memory budgets, warmups and persistence differ. One measured run per point; 1 TB excludes keys and storage/index overhead.",
      "zh-CN":
        "160 连接时 Garnet GET 领先：419,982 QPS，对比 Lavik 375,966。本次各同连接数 GET/SET 点中 Lavik p99.9 最低。内存预算、预热与持久化各异；每点仅测一次，1 TB 不含键及存储/索引开销。",
    },
    stats: [
      {
        value: "1,129,597",
        label: {
          en: "Lavik peak GET QPS",
          "zh-CN": "Lavik GET 峰值 QPS",
        },
      },
      {
        value: "0.943 ms",
        label: {
          en: "Lavik GET p99.9 · 320 connections",
          "zh-CN": "Lavik GET p99.9 · 320 连接",
        },
      },
      {
        value: "910,356",
        label: {
          en: "Lavik peak SET QPS",
          "zh-CN": "Lavik SET 峰值 QPS",
        },
      },
    ],
    steps: [
      {
        en: "Install all six pinned releases and memtier 2.5.1. Use one database at a time on the same 16-vCPU server with a separate client.",
        "zh-CN":
          "安装六种指定发布版及 memtier 2.5.1。在同一台 16 vCPU 服务端逐一运行数据库，使用独立客户端。",
      },
      {
        en: "Verify dedicated empty devices. Prepare SPDK and 8 GiB hugepages for Lavik; use the report’s RAID0/XFS setup for filesystem peers.",
        "zh-CN":
          "核验专用空设备，为 Lavik 准备 SPDK 和 8 GiB 大页；文件系统对照使用报告的 RAID0/XFS 配置。",
      },
      {
        en: "Save the Kvrocks/Pika/Tendis override blocks as named files and apply the supplied overlay script to their release configuration templates.",
        "zh-CN":
          "将 Kvrocks/Pika/Tendis 覆盖配置保存为指定文件，使用提供的脚本叠加至各发布版配置模板。",
      },
      {
        en: "Load one billion keys independently per system. Apply the specified Dragonfly/Garnet warmup, sweep 160–1280 connections, and reconcile sampled lengths, successful operations, misses and errors.",
        "zh-CN":
          "每种系统独立加载十亿键，按要求对 Dragonfly/Garnet 预热，测试 160–1280 个连接，并核对抽样长度、成功操作数、未命中及错误。",
      },
    ],
  },
  {
    id: "aerospike-ycsb",
    directory: "lavik-v0.2.0-aerospike-ycsb-2026-10-21",
    date: "2026-10-21",
    label: {
      en: "Lavik vs Aerospike",
      "zh-CN": "Lavik 与 Aerospike",
    },
    title: {
      en: "Lavik vs Aerospike",
      "zh-CN": "Lavik 与 Aerospike 对比",
    },
    summary: {
      en: "100M records, ten fields per record, four YCSB workload mixes, and both a 100K target rate and unlimited throughput.",
      "zh-CN":
        "1 亿条记录，每条十个字段，覆盖四种 YCSB 负载组合，以及 100K 目标速率和不限速两种场景。",
    },
    takeaway: {
      en: "Lavik’s unlimited total throughput is 9.06%–24.08% higher across the four measured workloads. Read-only C reaches 482,358 QPS with 1.754 ms READ p99.9.",
      "zh-CN":
        "四种实测负载中，Lavik 不限速总吞吐量高出 9.06%–24.08%；纯读 C 达到 482,358 QPS，READ p99.9 为 1.754 ms。",
    },
    scope: {
      en: "100M records × 10 × 128 B fields · Aerospike CE 8.1.2.4-4 · Lavik io_uring · raw RAID0 partitions · 256 YCSB workers · 300 s per window",
      "zh-CN":
        "1 亿记录 × 10 × 128 B 字段 · Aerospike CE 8.1.2.4-4 · Lavik io_uring · 原始 RAID0 分区 · 256 个 YCSB 工作线程 · 每窗口 300 秒",
    },
    caveat: {
      en: "Lavik has higher p99.9 in four of seven unlimited operation cells; A/READ is 4.399 ms versus Aerospike’s 2.225 ms. Lavik uses 12 workers plus four system/IRQ CPUs; Aerospike retains its original host policy. D reads uniformly over original keys, not latest-key YCSB D.",
      "zh-CN":
        "不限速七个操作单元中，Lavik 有四个 p99.9 更高；A/READ 为 4.399 ms，Aerospike 为 2.225 ms。Lavik 采用 12 worker 加 4 系统/IRQ CPU，Aerospike 保留原主机策略。D 均匀读取原始键，并非标准最新键 YCSB D。",
    },
    stats: [
      {
        value: "+24.08%",
        label: {
          en: "Unlimited D-Uniform total throughput",
          "zh-CN": "不限速 D-Uniform 总吞吐量提升",
        },
      },
      {
        value: "482,358",
        label: {
          en: "Lavik C QPS · READ p99.9 1.754 ms",
          "zh-CN": "Lavik C QPS · READ p99.9 1.754 ms",
        },
      },
      {
        value: "16",
        label: {
          en: "Measured 300-second windows",
          "zh-CN": "个 300 秒测量窗口",
        },
      },
    ],
    steps: [
      {
        en: "Prepare two separate empty raw RAID0 partitions and the pinned database packages. Install Java 17 and the report’s custom YCSB commit; apply the documented HREPLACE binding rename before building.",
        "zh-CN":
          "准备两个独立空原始 RAID0 分区及指定数据库发布包。安装 Java 17 和报告指定的自定义 YCSB 提交，构建前完成所述 HREPLACE 绑定重命名。",
      },
      {
        en: "Run Aerospike first under the original host policy. Load 100M records, stop cleanly, recover, and verify server counts plus all ten fields in sampled records.",
        "zh-CN":
          "先在原主机策略下运行 Aerospike，加载 1 亿记录，干净停止、恢复，并核验服务端记录数及抽样记录的全部十个字段。",
      },
      {
        en: "Run C/A/B/D-Uniform, 100K then unlimited, with a separate warmup JVM and 300-second measurement JVM. Retain ordinary whole-window HDR histograms and error counters.",
        "zh-CN":
          "按 C/A/B/D-Uniform 顺序，每种先 100K 后不限速，分别使用预热 JVM 和 300 秒测量 JVM；保留普通完整窗口 HDR 直方图与错误计数。",
      },
      {
        en: "Stop Aerospike, apply Lavik’s documented 12+4 CPU/IRQ isolation, independently load and recover Lavik, then repeat the matrix. Restore the original host policy afterward.",
        "zh-CN":
          "停止 Aerospike，应用 Lavik 文档中的 12+4 CPU/IRQ 隔离，独立加载并恢复 Lavik，再重复测试矩阵，最后恢复原主机策略。",
      },
    ],
  },
];
export const benchmarkRoute = (id: string) => "benchmarks/" + id;
export const benchmarkForRoute = (route: string) =>
  benchmarkReports.find((r) => benchmarkRoute(r.id) === route);
