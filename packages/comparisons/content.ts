import type { Locale } from "../content/schema";
import type { ProductId } from "./catalog";
export const bilingual = (en: string, zh: string): Record<Locale, string> => ({
  en,
  "zh-CN": zh,
});
const b = bilingual;
type Copy = ReturnType<typeof b>;
export type ComparisonCopy = {
  angle: Copy;
  summary: Copy;
  tested: string;
  design: Copy;
  consequence: Copy;
  nuance: Copy;
  choose: Copy;
  retain: Copy;
  question: Copy;
  answer: Copy;
  sources: string[];
};
export const comparisonCopy: Record<ProductId, ComparisonCopy> = {
  redis: {
    angle: {
      en: "Redis performance without a DRAM-sized capacity bill.",
      "zh-CN": "Redis 级体验，无需按 DRAM 价格扩充容量。",
    },
    summary: {
      en: "Lavik 0.2.0 puts values on NVMe SSD and delivers higher peak GET and SET throughput than Redis 8.10.2 in our 16-vCPU benchmark. Keep the Redis interface as your dataset grows.",
      "zh-CN":
        "Lavik 0.2.0 将值存入 NVMe SSD，在 16 vCPU 基准测试中实现了高于 Redis 8.10.2 的 GET 与 SET 峰值吞吐量，让数据增长继续沿用熟悉的 Redis 接口。",
    },
    tested: "Redis 8.10.2 · DRAM",
    design: {
      en: "Redis serves this dataset from DRAM. Lavik keeps a compact key index in memory and stores values on NVMe SSD. A GET still arrives through a Redis client; the storage engine does the work of finding and reading the value.",
      "zh-CN":
        "Redis 从 DRAM 提供本次数据集。Lavik 将紧凑键索引保留在内存，值存于 NVMe SSD。GET 仍通过 Redis 客户端发出，由存储引擎定位并读取值。",
    },
    consequence: {
      en: "A cache should grow because keeping more data improves the application—not because the team can afford another memory-heavy shard. Lavik gives product catalogs, cached API responses and feature records room to grow while preserving familiar reads, writes and TTLs.",
      "zh-CN":
        "缓存规模应由保留数据对应用的价值决定。Lavik 让商品目录、API 响应缓存与特征记录拥有更大的容量空间，同时保留熟悉的读写与 TTL 操作。",
    },
    nuance: {
      en: "October 21, 2026: 10M keys × 1 KiB, pipeline 1, 30-second windows. All displayed peaks use 1,280 connections. Redis AOF and scheduled snapshots are disabled. Values come from archived memtier JSON outputs; latency is p99.9 at the same point.",
      "zh-CN":
        "2026-10-21：1,000 万键 × 1 KiB，pipeline 1，每点 30 秒。展示的峰值均为 1,280 个连接。Redis 关闭 AOF 与定时快照。数值来自归档的 memtier JSON 输出；p99.9 与吞吐量来自同一测量点。",
    },
    choose: {
      en: "Start with the Redis dataset that costs the most to keep in memory: a large cache, a growing profile store or a feature-serving layer. The larger the value payload, the more capacity cost can move from DRAM to SSD.",
      "zh-CN":
        "先迁移内存成本最突出的数据集：大容量缓存、增长中的画像或在线特征。值数据越大，可从 DRAM 转向 SSD 的容量成本越多。",
    },
    retain: {
      en: "Run Lavik 0.2.0, point a test instance of your existing client at it, then use RedisShake for a full copy and incremental catch-up. Compare counts and sampled values before moving traffic; keep the source available through cutover.",
      "zh-CN":
        "启动 Lavik 0.2.0，接入现有客户端的测试实例，再使用 RedisShake 完成全量复制与增量追赶。切流前核对键数和抽样值，并在切换期间保留源端。",
    },
    question: {
      en: "Where does the 20× capacity-cost saving come from?",
      "zh-CN": "20 倍容量成本优势来自哪里？",
    },
    answer: {
      en: "Values move from DRAM to NVMe SSD. At a 20:1 price per GiB, the same value capacity costs 95% less. Add index memory, replicas and the rest of the server to estimate the complete deployment.",
      "zh-CN":
        "值容量从 DRAM 转到 NVMe SSD。按每 GiB 单价 20:1 计算，相同值容量的介质成本降低 95%。估算完整部署时，再计入索引内存、副本及服务器其余成本。",
    },
    sources: ["stable-memory", "stable-overview", "stable-storage-design"],
  },
  valkey: {
    angle: {
      en: "Keep your clients. Give your data more room.",
      "zh-CN": "保留客户端，让数据拥有更大空间。",
    },
    summary: {
      en: "Compare Lavik 0.2.0 with Valkey 9.1.2: higher peak GET and SET throughput in the 16-vCPU test, with values on NVMe SSD instead of DRAM.",
      "zh-CN":
        "对比 Lavik 0.2.0 与 Valkey 9.1.2：在 16 vCPU 测试中实现更高的 GET、SET 峰值吞吐量，值存储使用 NVMe SSD。",
    },
    tested: "Valkey 9.1.2 · DRAM",
    design: {
      en: "Valkey is an in-memory store in this comparison. Lavik changes where values live, while keeping the RESP interface that Redis and Valkey clients use. Key indexes and request buffers stay in memory; values can grow beyond RAM.",
      "zh-CN":
        "本次对比中的 Valkey 使用内存存储。Lavik 改变值的存储位置，同时保留 Redis、Valkey 客户端使用的 RESP 接口。键索引与请求缓冲留在内存，值容量可超越内存大小。",
    },
    consequence: {
      en: "Longer session retention, larger catalogs and more features per entity all expand stored bytes. Lavik lets those datasets use SSD capacity without introducing a new client protocol or a separate application-managed cold store.",
      "zh-CN":
        "更长的会话保留期、更大的目录与更多实体特征都会增加存储量。Lavik 用 SSD 承载这些数据，无需引入新客户端协议或由应用另行管理冷数据存储。",
    },
    nuance: {
      en: "The October 21 test uses 10M keys, 1 KiB values and 16 vCPUs. Valkey GET uses 16 I/O threads; SET uses eight. The smaller-instance report is a separate experiment. Full curves show how throughput and p99.9 change with load.",
      "zh-CN":
        "10 月 21 日测试使用 1,000 万键、1 KiB 值与 16 vCPU。Valkey GET 使用 16 个 I/O 线程，SET 使用 8 个。小型实例报告属于独立实验；完整曲线展示吞吐量和 p99.9 随负载的变化。",
    },
    choose: {
      en: "Use Lavik when retention or value size drives the memory bill. Start with your normal client and command mix, then increase the dataset to the size you want to retain—not merely the size that currently fits in RAM.",
      "zh-CN":
        "当保留期或值大小推动内存账单时，采用 Lavik。使用现有客户端与命令组合，将数据集扩大到业务希望保留的规模。",
    },
    retain: {
      en: "Use the client-library guide to check your connection, pipelining and reconnect settings. Rehearse the migration and traffic switch on a representative dataset, then use the same measurements for production sizing.",
      "zh-CN":
        "根据客户端指南检查连接、流水线与重连配置。在代表性数据集上演练迁移和切流，再用同样的测量方式规划生产容量。",
    },
    question: {
      en: "Can I keep my Redis or Valkey client?",
      "zh-CN": "可以继续使用 Redis 或 Valkey 客户端吗？",
    },
    answer: {
      en: "Lavik supports RESP2 and RESP3. Use the 0.2.0 command reference and tested client-library profiles to map the operations your application uses, including scripts, transactions and expiry.",
      "zh-CN":
        "Lavik 支持 RESP2 与 RESP3。使用 0.2.0 命令参考和客户端兼容指南，确认应用所需的脚本、事务、过期及其他操作。",
    },
    sources: ["stable-memory", "stable-overview", "stable-storage-design"],
  },
  dragonfly: {
    angle: {
      en: "Read the long tail without the long wait.",
      "zh-CN": "读取长尾数据，不必漫长等待。",
    },
    summary: {
      en: "Lavik 0.2.0 vs DragonflyDB 2.0.2: 1.39× GET and 1.36× SET throughput at the same 320 connections on a billion-key dataset. Compare paired tail latency and the complete SSD-backed workloads.",
      "zh-CN":
        "Lavik 0.2.0 对比 DragonflyDB 2.0.2：十亿键、同为 320 连接时，GET 吞吐量为 1.39 倍、SET 为 1.36 倍，并展示配对尾延迟与完整 SSD 负载。",
    },
    tested: "Dragonfly 2.0.2 · SSD tiering",
    design: {
      en: "Dragonfly moves values between memory and its SSD tier. Lavik uses an SSD-capable storage engine with a memory key index and asynchronous reads. Its workers continue processing other requests while NVMe I/O is in flight.",
      "zh-CN":
        "Dragonfly 在内存与 SSD 层之间移动值。Lavik 使用内存键索引与支持 SSD 的存储引擎，通过异步读取让工作线程在 NVMe I/O 进行时继续处理其他请求。",
    },
    consequence: {
      en: "At 320 connections, Lavik serves 652,881 GET QPS at 0.943 ms p99.9; Dragonfly 2.0.2 serves 469,604 at 17.023 ms. SET is 701,241 versus 517,357 QPS, with p99.9 of 0.959 versus 14.143 ms. Use the paired points to plan read-heavy services and refresh work.",
      "zh-CN":
        "320 连接时，Lavik GET 为 652,881 QPS、p99.9 0.943 ms；Dragonfly 2.0.2 为 469,604 QPS、17.023 ms。SET 为 701,241 与 517,357 QPS，p99.9 分别为 0.959 与 14.143 ms。可用配对结果规划读密集服务与后台刷新。",
    },
    nuance: {
      en: "October 21–22, 2026: one billion 1 KiB values, 16 vCPUs, six NVMe SSDs, 32 client threads, pipeline 1 and 60-second windows. The displayed comparison uses 320 connections. Garnet leads GET at 160 connections; Lavik leads the full-sweep GET and SET peaks. Memory budgets, warmups and persistence differ; use the full report for the 160–1280 connection curves.",
      "zh-CN":
        "2026 年 10 月 21–22 日：十亿个 1 KiB 值、16 vCPU、六块 NVMe SSD、32 客户端线程、pipeline 1、60 秒窗口。本页比较 320 连接。160 连接时 Garnet GET 领先；完整扫描中 Lavik GET 与 SET 峰值领先。内存预算、预热和持久化各异，160–1280 连接曲线见完整报告。",
    },
    choose: {
      en: "Choose Lavik for broad-access caches and online state that keeps growing beyond RAM. Its SSD storage also covers strings, hashes, lists, sets, sorted sets and streams, with grouped representations for large objects.",
      "zh-CN":
        "选择 Lavik 承载超出内存且访问范围广的缓存与在线状态。SSD 存储覆盖字符串、哈希、列表、集合、有序集合及流，大对象采用分组表示。",
    },
    retain: {
      en: "Move one representative dataset first. Replay the real read distribution, including low-locality reads, and compare delivered QPS at the required tail latency. Use that operating point to size the deployment.",
      "zh-CN":
        "先迁移一个代表性数据集，回放包含低局部性读取的真实请求分布，按所需尾延迟比较有效 QPS，再据此规划部署规模。",
    },
    question: {
      en: "Does Lavik put Redis collections on SSD too?",
      "zh-CN": "Lavik 也能将 Redis 集合存入 SSD 吗？",
    },
    answer: {
      en: "Yes. Lavik 0.2.0 supports SSD-backed payloads across strings, hashes, lists, sets, sorted sets and streams. Dragonfly’s documented tiering includes strings and experimental list/hash paths; the comparison here measures string GET/SET.",
      "zh-CN":
        "可以。Lavik 0.2.0 的 SSD 值存储覆盖字符串、哈希、列表、集合、有序集合和流。Dragonfly 文档包含字符串及实验性列表、哈希分层；本页性能比较使用字符串 GET/SET。",
    },
    sources: ["stable-storage", "stable-collections", "dragonfly-docs"],
  },
  garnet: {
    angle: {
      en: "More read throughput from the same SSD fleet.",
      "zh-CN": "相同 SSD 资源，提供更高读取吞吐量。",
    },
    summary: {
      en: "Lavik 0.2.0 vs Garnet 2.2.1: 2.58× GET and 1.05× SET throughput at the same 320 connections on a billion-key dataset. Compare paired tail latency and the complete SSD-backed workloads.",
      "zh-CN":
        "Lavik 0.2.0 对比 Garnet 2.2.1：十亿键、同为 320 连接时，GET 吞吐量为 2.58 倍、SET 为 1.05 倍，并展示配对尾延迟与完整 SSD 负载。",
    },
    tested: "Garnet 2.2.1 · storage enabled",
    design: {
      en: "Garnet’s log-structured storage and Lavik’s NVMe storage engine make different choices about indexing, caching and data organization. Lavik couples worker-owned state with asynchronous I/O and grouped storage for large Redis objects.",
      "zh-CN":
        "Garnet 的日志结构存储与 Lavik 的 NVMe 存储引擎在索引、缓存和数据组织上采用不同设计。Lavik 将工作线程本地状态、异步 I/O 与大 Redis 对象的分组存储结合。",
    },
    consequence: {
      en: "At 320 connections, Lavik serves 652,881 GET QPS at 0.943 ms p99.9; Garnet 2.2.1 serves 253,433 at 7.167 ms. SET is 701,241 versus 668,406 QPS, with p99.9 of 0.959 versus 4.415 ms. Use the paired points to plan read-heavy services and refresh work.",
      "zh-CN":
        "320 连接时，Lavik GET 为 652,881 QPS、p99.9 0.943 ms；Garnet 2.2.1 为 253,433 QPS、7.167 ms。SET 为 701,241 与 668,406 QPS，p99.9 分别为 0.959 与 4.415 ms。可用配对结果规划读密集服务与后台刷新。",
    },
    nuance: {
      en: "October 21–22, 2026: one billion 1 KiB values, 16 vCPUs, six NVMe SSDs, 32 client threads, pipeline 1 and 60-second windows. The displayed comparison uses 320 connections. Garnet leads GET at 160 connections; Lavik leads the full-sweep GET and SET peaks. Memory budgets, warmups and persistence differ; use the full report for the 160–1280 connection curves.",
      "zh-CN":
        "2026 年 10 月 21–22 日：十亿个 1 KiB 值、16 vCPU、六块 NVMe SSD、32 客户端线程、pipeline 1、60 秒窗口。本页比较 320 连接。160 连接时 Garnet GET 领先；完整扫描中 Lavik GET 与 SET 峰值领先。内存预算、预热和持久化各异，160–1280 连接曲线见完整报告。",
    },
    choose: {
      en: "Use Lavik when large-dataset reads and predictable read latency are central to the application. Check the same read distribution and command mix at the full retention size.",
      "zh-CN":
        "当大数据集读取和读取延迟是应用核心需求时，采用 Lavik，并在完整保留规模下检查真实读取分布与命令组合。",
    },
    retain: {
      en: "Run the read/write mix that drives your production bill. Measure both tail latency and throughput, include background maintenance, and translate the accepted point into server and replica requirements.",
      "zh-CN":
        "运行决定生产成本的读写组合，同时测量尾延迟和吞吐量，包含后台维护，再将满足要求的运行点转化为服务器与副本需求。",
    },
    question: {
      en: "How can using fewer servers reduce cost?",
      "zh-CN": "减少服务器如何降低成本？",
    },
    answer: {
      en: "If capacity is already sufficient, serving more requests per primary can reduce the number of primaries required for a target QPS. The model below includes usable capacity, headroom, replicas and node prices; it is a planning calculation rather than a measured cluster result.",
      "zh-CN":
        "当容量足够时，每个主节点处理更多请求可减少达到目标 QPS 所需的主节点数。下方模型计入可用容量、余量、副本与节点价格，属于规划计算。",
    },
    sources: ["stable-storage", "stable-collections", "garnet-features"],
  },
  pika: {
    angle: {
      en: "Serve a billion keys with fewer read bottlenecks.",
      "zh-CN": "十亿键规模，减少读取瓶颈。",
    },
    summary: {
      en: "Lavik 0.2.0 vs Pika 3.5.7: 3.23× GET and 7.43× SET throughput at the same 320 connections on a billion-key dataset. Compare paired tail latency and the complete SSD-backed workloads.",
      "zh-CN":
        "Lavik 0.2.0 对比 Pika 3.5.7：十亿键、同为 320 连接时，GET 吞吐量为 3.23 倍、SET 为 7.43 倍，并展示配对尾延迟与完整 SSD 负载。",
    },
    tested: "Pika 3.5.7 release archive",
    design: {
      en: "Pika uses RocksDB to give Redis-compatible workloads disk capacity. Lavik takes an NVMe-oriented path: a compact in-memory key index, asynchronous storage I/O and worker-local request execution.",
      "zh-CN":
        "Pika 使用 RocksDB 为 Redis 兼容负载提供磁盘容量。Lavik 采用面向 NVMe 的路径：紧凑内存键索引、异步存储 I/O 与工作线程本地执行。",
    },
    consequence: {
      en: "At 320 connections, Lavik serves 652,881 GET QPS at 0.943 ms p99.9; Pika 3.5.7 serves 202,391 at 4.191 ms. SET is 701,241 versus 94,438 QPS, with p99.9 of 0.959 versus 8.831 ms. Use the paired points to plan read-heavy services and refresh work.",
      "zh-CN":
        "320 连接时，Lavik GET 为 652,881 QPS、p99.9 0.943 ms；Pika 3.5.7 为 202,391 QPS、4.191 ms。SET 为 701,241 与 94,438 QPS，p99.9 分别为 0.959 与 8.831 ms。可用配对结果规划读密集服务与后台刷新。",
    },
    nuance: {
      en: "October 21–22, 2026: one billion 1 KiB values, 16 vCPUs, six NVMe SSDs, 32 client threads, pipeline 1 and 60-second windows. The displayed comparison uses 320 connections. Garnet leads GET at 160 connections; Lavik leads the full-sweep GET and SET peaks. Memory budgets, warmups and persistence differ; use the full report for the 160–1280 connection curves.",
      "zh-CN":
        "2026 年 10 月 21–22 日：十亿个 1 KiB 值、16 vCPU、六块 NVMe SSD、32 客户端线程、pipeline 1、60 秒窗口。本页比较 320 连接。160 连接时 Garnet GET 领先；完整扫描中 Lavik GET 与 SET 峰值领先。内存预算、预热和持久化各异，160–1280 连接曲线见完整报告。",
    },
    choose: {
      en: "Bring large caches, user profiles and lookup-heavy application state to Lavik when SSD capacity is already essential and you want more work from each server.",
      "zh-CN":
        "当 SSD 容量已经必不可少、又希望提高每台服务器产出时，将大缓存、用户画像与查询密集应用状态迁至 Lavik。",
    },
    retain: {
      en: "Map the commands and TTL behavior your service uses, move a representative key range, and measure the workload with background maintenance active before expanding the rollout.",
      "zh-CN":
        "核对服务使用的命令和 TTL 行为，迁移代表性键范围，并在后台维护开启时测量负载，再扩大部署。",
    },
    question: {
      en: "Is this the stable Lavik release?",
      "zh-CN": "本页使用的是 Lavik 稳定版吗？",
    },
    answer: {
      en: "Yes. These October results use the downloadable Lavik 0.2.0 Standard package with SPDK. The matching report includes the release identity, hardware, configurations and reproduction commands.",
      "zh-CN":
        "是。10 月结果使用可下载的 Lavik 0.2.0 Standard 包及 SPDK。对应报告包含发布版本、硬件、配置与复现命令。",
    },
    sources: ["stable-storage", "stable-storage-design", "pika-readme"],
  },
  kvrocks: {
    angle: {
      en: "SSD capacity with a much faster read path.",
      "zh-CN": "SSD 容量，更快的读取路径。",
    },
    summary: {
      en: "Lavik 0.2.0 vs Apache Kvrocks 2.17.0: 8.87× GET and 6.11× SET throughput at the same 320 connections on a billion-key dataset. Compare paired tail latency and the complete SSD-backed workloads.",
      "zh-CN":
        "Lavik 0.2.0 对比 Apache Kvrocks 2.17.0：十亿键、同为 320 连接时，GET 吞吐量为 8.87 倍、SET 为 6.11 倍，并展示配对尾延迟与完整 SSD 负载。",
    },
    tested: "Apache Kvrocks 2.17.0 · RocksDB",
    design: {
      en: "Apache Kvrocks exposes Redis-compatible data structures over RocksDB. Lavik uses its own storage engine, with in-memory key lookup and asynchronous reads from NVMe SSD. Its grouped representation keeps large-object operations focused on the relevant records.",
      "zh-CN":
        "Apache Kvrocks 在 RocksDB 上提供 Redis 兼容数据结构。Lavik 使用自有存储引擎，在内存中定位键并异步读取 NVMe SSD；分组表示让大对象操作聚焦相关记录。",
    },
    consequence: {
      en: "At 320 connections, Lavik serves 652,881 GET QPS at 0.943 ms p99.9; Apache Kvrocks 2.17.0 serves 73,587 at 8.383 ms. SET is 701,241 versus 114,683 QPS, with p99.9 of 0.959 versus 6.047 ms. Use the paired points to plan read-heavy services and refresh work.",
      "zh-CN":
        "320 连接时，Lavik GET 为 652,881 QPS、p99.9 0.943 ms；Apache Kvrocks 2.17.0 为 73,587 QPS、8.383 ms。SET 为 701,241 与 114,683 QPS，p99.9 分别为 0.959 与 6.047 ms。可用配对结果规划读密集服务与后台刷新。",
    },
    nuance: {
      en: "October 21–22, 2026: one billion 1 KiB values, 16 vCPUs, six NVMe SSDs, 32 client threads, pipeline 1 and 60-second windows. The displayed comparison uses 320 connections. Garnet leads GET at 160 connections; Lavik leads the full-sweep GET and SET peaks. Memory budgets, warmups and persistence differ; use the full report for the 160–1280 connection curves.",
      "zh-CN":
        "2026 年 10 月 21–22 日：十亿个 1 KiB 值、16 vCPU、六块 NVMe SSD、32 客户端线程、pipeline 1、60 秒窗口。本页比较 320 连接。160 连接时 Garnet GET 领先；完整扫描中 Lavik GET 与 SET 峰值领先。内存预算、预热和持久化各异，160–1280 连接曲线见完整报告。",
    },
    choose: {
      en: "Choose Lavik for a larger online dataset whose reads must remain fast as more values live on SSD. Broad key access and feature-serving fan-out are good first workloads to evaluate.",
      "zh-CN":
        "当更大在线数据集需要在值驻留 SSD 后继续快速读取时，选择 Lavik。广泛键访问与在线特征扇出查询适合优先试用。",
    },
    retain: {
      en: "Replay your actual key popularity and read/write mix, then include expiration and background maintenance. Use the migration guide to plan transfer, validation and cutover.",
      "zh-CN":
        "回放实际键热度和读写组合，再加入过期及后台维护。根据迁移指南规划数据传输、验证与切流。",
    },
    question: {
      en: "Does Lavik use RocksDB?",
      "zh-CN": "Lavik 使用 RocksDB 吗？",
    },
    answer: {
      en: "Lavik’s Data storage engine is built around its own key index, grouped values and asynchronous I/O paths. It supports io_uring and SPDK storage backends. This comparison measures the SPDK path.",
      "zh-CN":
        "Lavik Data 存储引擎采用自有键索引、分组值表示与异步 I/O 路径，支持 io_uring 和 SPDK 存储后端。本次比较使用 SPDK。",
    },
    sources: ["stable-storage", "stable-storage-design", "kvrocks-structures"],
  },
  tendis: {
    angle: {
      en: "Keep disk capacity. Raise the read ceiling.",
      "zh-CN": "保留磁盘容量，提升读取吞吐量。",
    },
    summary: {
      en: "Lavik 0.2.0 vs Tendis 2.8.4: 5.39× GET and 5.10× SET throughput at the same 320 connections on a billion-key dataset. Compare paired tail latency and the complete SSD-backed workloads.",
      "zh-CN":
        "Lavik 0.2.0 对比 Tendis 2.8.4：十亿键、同为 320 连接时，GET 吞吐量为 5.39 倍、SET 为 5.10 倍，并展示配对尾延迟与完整 SSD 负载。",
    },
    tested: "Tendis 2.8.4 · RocksDB 8.5.3",
    design: {
      en: "Tendis uses RocksDB for disk-backed Redis-compatible storage. Lavik’s worker-owned key indexes and asynchronous NVMe reads give a different path from incoming command to stored value.",
      "zh-CN":
        "Tendis 使用 RocksDB 提供磁盘上的 Redis 兼容存储。Lavik 的工作线程本地键索引与异步 NVMe 读取，为命令访问存储值提供另一条路径。",
    },
    consequence: {
      en: "At 320 connections, Lavik serves 652,881 GET QPS at 0.943 ms p99.9; Tendis 2.8.4 serves 121,240 at 4.831 ms. SET is 701,241 versus 137,471 QPS, with p99.9 of 0.959 versus 7.999 ms. Use the paired points to plan read-heavy services and refresh work.",
      "zh-CN":
        "320 连接时，Lavik GET 为 652,881 QPS、p99.9 0.943 ms；Tendis 2.8.4 为 121,240 QPS、4.831 ms。SET 为 701,241 与 137,471 QPS，p99.9 分别为 0.959 与 7.999 ms。可用配对结果规划读密集服务与后台刷新。",
    },
    nuance: {
      en: "October 21–22, 2026: one billion 1 KiB values, 16 vCPUs, six NVMe SSDs, 32 client threads, pipeline 1 and 60-second windows. The displayed comparison uses 320 connections. Garnet leads GET at 160 connections; Lavik leads the full-sweep GET and SET peaks. Memory budgets, warmups and persistence differ; use the full report for the 160–1280 connection curves.",
      "zh-CN":
        "2026 年 10 月 21–22 日：十亿个 1 KiB 值、16 vCPU、六块 NVMe SSD、32 客户端线程、pipeline 1、60 秒窗口。本页比较 320 连接。160 连接时 Garnet GET 领先；完整扫描中 Lavik GET 与 SET 峰值领先。内存预算、预热和持久化各异，160–1280 连接曲线见完整报告。",
    },
    choose: {
      en: "Use Lavik for disk-resident online state where read throughput and read-tail latency determine the customer experience. Start with the dataset whose growth is forcing additional serving nodes.",
      "zh-CN":
        "对于读取吞吐量和尾延迟直接影响用户体验的磁盘在线状态，采用 Lavik。优先从数据增长迫使增加服务节点的数据集开始。",
    },
    retain: {
      en: "Confirm the command surface, then rehearse a representative migration with the source available. Compare target-load latency and capacity before the final traffic switch.",
      "zh-CN":
        "确认命令兼容范围，在保留源端的条件下演练代表性迁移；最终切流前比较目标负载下的延迟与容量。",
    },
    question: {
      en: "What should I compare besides QPS?",
      "zh-CN": "除了 QPS，还应比较什么？",
    },
    answer: {
      en: "Compare the same retained dataset, command mix, read distribution, p99.9 target and recovery policy. Then include index memory, replicas and failure headroom in the server count. The calculator makes the throughput and capacity constraints explicit.",
      "zh-CN":
        "比较相同保留数据集、命令组合、读取分布、p99.9 目标和恢复策略，再将索引内存、副本与故障余量计入节点数量。计算器明确展示吞吐量与容量两种约束。",
    },
    sources: ["stable-storage", "stable-storage-design", "tendis-readme"],
  },
};
export function comparisonFaq(id: ProductId, locale: Locale) {
  const c = comparisonCopy[id],
    zh = locale === "zh-CN";
  return [
    { question: c.question[locale], answer: c.answer[locale] },
    {
      question: zh
        ? "迁移时需要更换客户端协议吗？"
        : "Do I need a new client protocol?",
      answer: zh
        ? "不需要。Lavik 支持 RESP2 与 RESP3；请用 0.2.0 命令参考和客户端兼容指南确认应用需要的操作，再按 RedisShake 迁移指南完成 Redis 源端的数据复制与切流。" +
          (id === "redis"
            ? ""
            : " 对于其他产品，先确认 RedisShake 支持源端的 RDB 格式与复制流。")
        : "No. Lavik supports RESP2 and RESP3. Check your application’s operations against the 0.2.0 command reference and client-library guide, then follow the RedisShake migration guide for Redis-source transfer and cutover." +
          (id === "redis"
            ? ""
            : " For other products, first confirm that RedisShake supports the source RDB format and replication stream."),
    },
    {
      question: zh ? "如何开始试用？" : "How do I start?",
      answer: zh
        ? "安装 Lavik 0.2.0 二进制发布包，连接客户端，加载一个代表性数据集。快速入门、运维及监控文档覆盖从首次启动到日常管理的步骤。"
        : "Install the Lavik 0.2.0 binary package, connect your client, and load a representative dataset. The quick start, operations and monitoring guides take you from first launch to daily management.",
    },
  ];
}
