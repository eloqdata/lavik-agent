import type { Locale } from "../content/schema";
import type { ProductId } from "./catalog";
export const bilingual = (en: string, zh: string): Record<Locale, string> => ({
  en,
  "zh-CN": zh,
});
type Copy = ReturnType<typeof bilingual>;
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
    angle: bilingual(
      "Faster measured throughput. Capacity beyond DRAM.",
      "实测吞吐量更高，容量突破 DRAM 成本约束。",
    ),
    summary: bilingual(
      "Compare Lavik on NVMe SSD with Redis 8.8.0 in DRAM: peak GET/SET QPS, tail latency, Redis compatibility, and a transparent 20:1 capacity-cost model.",
      "比较 NVMe SSD 上的 Lavik 与 DRAM 中的 Redis 8.8.0：GET/SET 峰值吞吐量、尾延迟、Redis 兼容性与透明的 20:1 容量成本模型。",
    ),
    tested: "Redis 8.8.0 · DRAM",
    design: bilingual(
      "The Redis control serves its dataset from DRAM. Lavik keeps its key index in memory and stores values on NVMe SSD. Redis clients still speak RESP; the change is in storage and execution, rather than a new application protocol.",
      "本次 Redis 对照组从 DRAM 提供数据。Lavik 将键索引保留在内存，将值存入 NVMe SSD。客户端仍使用 RESP 协议；改变的是存储与执行方式，而非应用协议。",
    ),
    consequence: bilingual(
      "A growing cache can require more memory capacity long before it exhausts CPU. Moving value capacity to SSD can reduce that pressure while retaining familiar commands. Lavik's worker-owned state, coroutine runtime and asynchronous storage paths are designed to keep requests progressing while I/O completes.",
      "不断增长的缓存可能在耗尽 CPU 之前就需要扩充内存。将值容量迁至 SSD，可以缓解压力并保留熟悉的命令。Lavik 的工作线程本地状态、协程运行时与异步存储路径，使请求在 I/O 完成期间仍可持续推进。",
    ),
    nuance: bilingual(
      "These are open-source Redis server results, not Redis Cloud or Redis Flex. Redis AOF and automatic snapshots were disabled. The 10-million-key dataset fits the server's RAM; it establishes measured throughput, not a terabyte-scale Redis capacity result. Different peak connection counts also matter.",
      "这是开源 Redis 服务端的结果，并非 Redis Cloud 或 Redis Flex。测试关闭了 Redis AOF 和自动快照。1,000 万键数据集可放入服务器内存；它说明实测吞吐量，不代表 TB 级 Redis 容量结果。两者峰值对应的连接数也不同。",
    ),
    choose: bilingual(
      "Prioritize Lavik when value growth drives your DRAM bill, especially for broad-access caches and feature lookups that cannot rely on a tiny hot set. Validate your exact commands, scripts, expiration behavior and recovery requirements on beta.1.",
      "当值数据增长推动 DRAM 账单上升时，优先评估 Lavik，尤其适用于访问分布广、无法依赖极小热点集的缓存与特征查询。请在 beta.1 上验证实际命令、脚本、过期行为和恢复要求。",
    ),
    retain: bilingual(
      "Keep your existing Redis deployment when its capacity cost is acceptable and it already satisfies your operational needs, or when required command/module behavior has not passed your Lavik compatibility tests. Migration value should exceed the effort of validation and cutover.",
      "如果现有 Redis 容量成本可接受、运维能力满足需求，或必需的命令及模块行为尚未通过 Lavik 兼容性测试，可以继续使用。迁移收益应超过验证与切换的投入。",
    ),
    question: bilingual(
      "Is Lavik 20× cheaper than Redis?",
      "Lavik 是否比 Redis 便宜 20 倍？",
    ),
    answer: bilingual(
      "For value capacity, a DRAM price per GiB that is 20 times the SSD price gives 20× lower media cost. This is an explicit price assumption, not a measured whole-service bill. Index memory, CPU, replicas, backup and operational costs remain.",
      "对于值容量，若 DRAM 每 GiB 单价为 SSD 的 20 倍，则介质成本降至 1/20。这是明确的价格假设，并非整个服务账单的实测结果；仍需计入索引内存、CPU、副本、备份和运维成本。",
    ),
    sources: [
      "beta-report",
      "beta-results",
      "lavik-beta-overview",
      "lavik-beta-storage",
    ],
  },
  valkey: {
    angle: bilingual(
      "Keep the protocol. Change the economics of capacity.",
      "保留熟悉的协议，改变容量成本。",
    ),
    summary: bilingual(
      "Lavik vs Valkey 9.1.0: higher measured peak GET and SET QPS on NVMe SSD, the SET latency tradeoff, and DRAM versus SSD capacity economics.",
      "Lavik 与 Valkey 9.1.0 对比：NVMe SSD 上更高的实测 GET/SET 峰值 QPS、SET 延迟差异，以及 DRAM 与 SSD 的容量成本。",
    ),
    tested: "Valkey 9.1.0 · DRAM",
    design: bilingual(
      "The tested Valkey configurations keep the dataset in DRAM. Lavik uses a memory key index with SSD value storage while accepting Redis/Valkey-compatible commands over RESP. A protocol match makes existing client investment useful; it does not prove identical behavior for every command and option.",
      "测试中的 Valkey 将数据集保留在 DRAM。Lavik 使用内存键索引与 SSD 值存储，通过 RESP 接受 Redis/Valkey 兼容命令。协议一致可复用客户端投入，但不代表所有命令与选项的行为完全相同。",
    ),
    consequence: bilingual(
      "For long-lived sessions, caches and machine-generated feature data, the important question is whether useful capacity must grow at DRAM prices. Lavik makes NVMe SSD the value-capacity tier, then uses asynchronous execution to pursue high throughput without making the entire value set resident in memory.",
      "对于长期会话、缓存和机器生成的特征数据，关键在于有效容量是否必须按 DRAM 价格扩展。Lavik 以 NVMe SSD 承载值容量，并通过异步执行追求高吞吐量，无需把全部值常驻内存。",
    ),
    nuance: bilingual(
      "Lavik has higher peak GET and SET QPS in this sweep. Valkey's selected peak SET point has lower p99 latency: 4.383 ms versus Lavik's 4.799 ms. The report includes Valkey's 1/2/4/8/16 I/O-thread configurations; the best SET result uses eight, not sixteen. Valkey persistence was disabled.",
      "本次扫描中 Lavik 的 GET 与 SET 峰值 QPS 更高。但 Valkey 所选 SET 峰值点的 p99 更低：4.383 ms，而 Lavik 为 4.799 ms。报告覆盖 Valkey 的 1/2/4/8/16 个 I/O 线程配置；SET 最佳结果使用 8 个线程。Valkey 持久化被关闭。",
    ),
    choose: bilingual(
      "Evaluate Lavik when memory is the scaling constraint and your Valkey command/client footprint fits Lavik's versioned compatibility coverage. Compare throughput at your latency budget, then replay expiry, reconnect and failover paths before a staged migration.",
      "当内存成为扩展瓶颈，且应用使用的 Valkey 命令和客户端在 Lavik 版本化兼容范围内时，可评估 Lavik。按实际延迟预算比较吞吐量，再验证过期、重连和故障切换路径，分阶段迁移。",
    ),
    retain: bilingual(
      "Retain Valkey when an existing DRAM-sized workload is economical and its behavior is already proven in your application. In particular, do not trade away a write-latency requirement merely to maximize the headline QPS number.",
      "如果现有适合 DRAM 的工作负载成本合理、应用行为已得到验证，可以保留 Valkey。尤其不要只为提高峰值 QPS 而牺牲写入延迟要求。",
    ),
    question: bilingual(
      "Does higher QPS mean Lavik has lower latency on every operation?",
      "更高 QPS 是否意味着 Lavik 每种操作的延迟都更低？",
    ),
    answer: bilingual(
      "No. In the 10M-key peak results, Lavik leads GET/SET throughput and GET p99, while Valkey has the lower SET p99 at its own peak. Use the full connection sweep to select an operating point that meets your latency budget.",
      "不是。在 1,000 万键的峰值结果中，Lavik 的 GET/SET 吞吐量与 GET p99 更优，而 Valkey 在其自身 SET 峰值点的 p99 更低。请使用完整连接数扫描，选择满足延迟预算的运行点。",
    ),
    sources: [
      "beta-report",
      "beta-results",
      "lavik-beta-overview",
      "lavik-beta-storage",
    ],
  },
  dragonfly: {
    angle: bilingual(
      "Billion-key reads without the same tail-latency penalty.",
      "十亿键读取，显著降低实测尾延迟。",
    ),
    summary: bilingual(
      "Lavik vs DragonflyDB SSD tiering: billion-key GET/SET benchmarks, p99 latency, node-cost scenarios, and version-aware data-structure support.",
      "Lavik 与 DragonflyDB SSD 分层对比：十亿键 GET/SET 基准、p99 延迟、节点成本模型及版本相关的数据结构支持。",
    ),
    tested: "Dragonfly 1.40.2 · Tiered Storage",
    design: bilingual(
      "Both systems can use NVMe SSD; the distinction is how they serve data beyond RAM. Dragonfly's tiering controls offload and promotion around memory thresholds. Lavik's durable value representation is served through its storage engine, with worker-owned indexes and asynchronous NVMe I/O.",
      "两者均可使用 NVMe SSD，差异在于如何服务超出内存的数据。Dragonfly 按内存阈值控制下放与提升；Lavik 通过存储引擎访问持久化值，结合工作线程拥有的索引与异步 NVMe I/O。",
    ),
    consequence: bilingual(
      "Lavik stores strings, hashes, lists, sets and sorted-set payloads through its SSD-capable storage engine. Dragonfly's standard tiering focuses on strings; official documentation also describes experimental list-node and hash offloading. Therefore a blanket 'Dragonfly only supports strings on SSD' claim is outdated. The supplied benchmark measures string GET/SET, not these collection paths.",
      "Lavik 通过支持 SSD 的存储引擎承载字符串、哈希、列表、集合和有序集合载荷。Dragonfly 的常规分层主要面向字符串；官方文档也介绍了实验性的列表节点和哈希下放。因此，“Dragonfly 的 SSD 只支持字符串”这一概括已过时。所给基准测试的是字符串 GET/SET，而非这些集合路径。",
    ),
    nuance: bilingual(
      "The billion-key run gives Dragonfly 96 GiB maxmemory and files on RAID0/XFS across the same six NVMe devices used raw by Lavik SPDK. Dragonfly receives a 180-second GET warmup. These are different storage configurations, not an isolated test of a single architectural feature. Compare complete points, including connections and p99.",
      "十亿键测试中，Dragonfly 配置 96 GiB maxmemory，使用六块 NVMe 上的 RAID0/XFS 文件；Lavik SPDK 直接访问相同设备。Dragonfly 进行 180 秒 GET 预热。这是不同存储配置的整体比较，并非对单一架构特征的隔离实验。请连同连接数和 p99 比较完整测量点。",
    ),
    choose: bilingual(
      "Prioritize Lavik for broad random access to a large value set, or when growing hashes, lists, sets and sorted sets also need SSD capacity. Higher observed throughput per server can translate into fewer provisioned nodes; the sizing model below makes that inference explicit.",
      "对于大规模值集合的广泛随机访问，或哈希、列表、集合、有序集合也需要 SSD 容量的场景，可优先评估 Lavik。单机更高的实测吞吐量可能减少所需节点；下方模型明确展示这一推导。",
    ),
    retain: bilingual(
      "Dragonfly remains worth evaluating when your working set stays hot in RAM or your string-tiering workload already meets its latency budget. Recheck current experimental collection support against your exact data shapes rather than assuming benchmark GET/SET results predict collection performance.",
      "如果工作集主要命中内存，或字符串分层负载已满足延迟预算，Dragonfly 仍值得评估。请按实际数据形态验证当前实验性集合支持，不要把 GET/SET 基准外推为集合性能。",
    ),
    question: bilingual(
      "Can both Lavik and Dragonfly use SSD for Redis data?",
      "Lavik 与 Dragonfly 都能用 SSD 存 Redis 数据吗？",
    ),
    answer: bilingual(
      "Yes. Lavik's storage engine covers string, hash, list, set and sorted-set payloads. Dragonfly supports string tiering and documents experimental list/hash tiering with restrictions. Both still use memory; neither makes metadata and buffers free.",
      "可以。Lavik 存储引擎覆盖字符串、哈希、列表、集合和有序集合载荷。Dragonfly 支持字符串分层，并提供有限制的实验性列表与哈希分层。两者仍需内存，元数据和缓冲区并非没有成本。",
    ),
    sources: [
      "beta-report",
      "beta-results",
      "dragonfly-docs",
      "dragonfly-ga",
      "lavik-beta-storage",
    ],
  },
  garnet: {
    angle: bilingual(
      "A stronger read result. A real write-latency tradeoff.",
      "读取优势突出，写入延迟需按目标选择。",
    ),
    summary: bilingual(
      "Lavik vs Microsoft Garnet: NVMe SSD GET throughput, honest SET latency tradeoffs, Tsavorite storage differences, and an editable node-cost model.",
      "Lavik 与 Microsoft Garnet 对比：NVMe SSD 读取吞吐量、SET 延迟取舍、Tsavorite 存储差异及可调整的节点成本模型。",
    ),
    tested: "Garnet 2.1.5 · Libaio Storage Tier",
    design: bilingual(
      "Garnet uses the Tsavorite hybrid log, with a memory-resident portion and a larger-than-memory storage tier. Lavik uses memory key indexes and its own durable record/collection storage, with SPDK or io_uring I/O. Both offer Redis-style data structures; Garnet should not be described as a string-only database.",
      "Garnet 使用 Tsavorite 混合日志，包含内存驻留部分及超内存容量的存储层。Lavik 采用内存键索引、自有持久化记录与集合存储，以及 SPDK 或 io_uring I/O。两者都提供 Redis 风格数据结构，不能将 Garnet 描述为仅支持字符串的数据库。",
    ),
    consequence: bilingual(
      "The billion-key results make Lavik particularly interesting for read-heavy services: feature retrieval, large caches and profile lookups. A high-rate write service needs a different decision. Garnet's write tail can be lower even when Lavik records slightly more peak SET throughput.",
      "十亿键结果使 Lavik 对特征获取、大型缓存、画像查询等读密集服务尤其有吸引力。高写入速率服务则需另行判断：即使 Lavik 的 SET 峰值吞吐量略高，Garnet 的写入尾延迟仍可能更低。",
    ),
    nuance: bilingual(
      "Garnet's peak SET p99 is 5.535 ms versus Lavik's 10.879 ms. At a p99 ceiling of 2 ms, the best observed SET points are about 584,665 QPS for Garnet and 422,450 for Lavik. Garnet's post-test full key-count scan was not completed; the report discloses that limitation. Its pre-test count passed.",
      "Garnet 的 SET 峰值 p99 为 5.535 ms，Lavik 为 10.879 ms。在 p99 不超过 2 ms 的条件下，实测最高 SET 吞吐量约为 Garnet 584,665 QPS、Lavik 422,450 QPS。Garnet 测试后的完整键数扫描未完成，报告已说明此限制；测试前计数通过。",
    ),
    choose: bilingual(
      "Start with Lavik for broad-access, read-dominated workloads whose data exceeds RAM. Use the measured GET advantage to evaluate capacity per server, then include updates, expirations and sustained maintenance in your replay.",
      "对于数据超出内存、访问广泛且以读为主的负载，可先评估 Lavik。用实测 GET 优势评估单机服务能力，再在回放中加入更新、过期与持续后台维护。",
    ),
    retain: bilingual(
      "Keep Garnet on the shortlist for a write-heavy workload with a tight p99 limit, or if your application depends on its .NET extensibility. The cost calculator can select SET and a 2 ms ceiling so this tradeoff is visible rather than hidden by peak GET numbers.",
      "如果工作负载写入密集、p99 要求严格，或依赖 .NET 扩展能力，应保留 Garnet 作为候选。成本计算器可选择 SET 和 2 ms 上限，直接展示这一取舍，避免被 GET 峰值掩盖。",
    ),
    question: bilingual(
      "Is Lavik always faster than Garnet?",
      "Lavik 是否总比 Garnet 快？",
    ),
    answer: bilingual(
      "No. Lavik has the higher peak GET and SET throughput in the September billion-key report, but Garnet has lower p99 at its peak SET point and more qualifying SET throughput under a 2 ms p99 ceiling. Compare the workload and latency target together.",
      "不是。在九月十亿键报告中，Lavik 的 GET/SET 峰值吞吐量更高，但 Garnet 的 SET 峰值 p99 更低，在 2 ms p99 上限内的 SET 吞吐量也更高。必须结合工作负载与延迟目标比较。",
    ),
    sources: [
      "beta-report",
      "beta-results",
      "garnet-features",
      "lavik-beta-storage",
    ],
  },
  pika: {
    angle: bilingual(
      "Disk capacity with substantially more measured throughput.",
      "保留磁盘容量，显著提升实测吞吐量。",
    ),
    summary: bilingual(
      "Lavik vs Pika: 200-million-key NVMe SSD benchmarks for GET, SET and mixed traffic, RocksDB storage differences, and throughput-driven cost estimates.",
      "Lavik 与 Pika 对比：2 亿键 NVMe SSD GET、SET、混合负载基准，RocksDB 存储差异及吞吐量驱动的成本估算。",
    ),
    tested: "Pika v4.0.3 source tag (binary reports 4.0.2)",
    design: bilingual(
      "Pika uses RocksDB to provide Redis-compatible data structures with capacity beyond memory. Lavik also targets Redis-compatible access, but serves its own durable records using an asynchronous storage engine. This comparison is between two disk-capable systems, not SSD capacity versus a mandatory all-DRAM Pika deployment.",
      "Pika 基于 RocksDB 提供容量超出内存的 Redis 兼容数据结构。Lavik 同样面向 Redis 兼容访问，但通过异步存储引擎服务自有持久化记录。这是两种支持磁盘的系统对比，并不是 SSD 容量与必须全部使用 DRAM 的 Pika 部署相比。",
    ),
    consequence: bilingual(
      "When disk capacity is already affordable, throughput per server becomes the next economic constraint. The August results show a Lavik SPDK advantage across read-only, write-only and mixed traffic. That gives a concrete starting point for reducing the number of nodes needed for a fixed request rate.",
      "当磁盘容量已足够经济时，单机吞吐量就成为下一个成本约束。八月结果显示 Lavik SPDK 在纯读、纯写和混合负载上均有优势，可作为估算固定请求速率下减少节点数量的依据。",
    ),
    nuance: bilingual(
      "The test built official Pika tag v4.0.3; the executable reports 4.0.2. It used 16 network threads, 32 request threads, three RocksDB instances, 24 GiB total block cache and 32 GiB RTC cache. WAL/binlog and compression were disabled; automatic compaction stayed enabled. These choices must accompany any performance claim.",
      "测试构建自 Pika 官方 v4.0.3 标签，但程序报告 4.0.2。配置包含 16 个网络线程、32 个请求线程、3 个 RocksDB 实例、合计 24 GiB 块缓存与 32 GiB RTC 缓存。WAL/binlog 与压缩被关闭，自动压缩整理保持开启。性能结论必须同时说明这些配置。",
    ),
    choose: bilingual(
      "Evaluate Lavik when broad random reads or mixed traffic are forcing a disk-backed Pika fleet to grow for QPS rather than bytes. Replay real collection commands as well: the published comparison measures string operations, not hash, list or sorted-set performance.",
      "当广泛随机读取或混合负载使 Pika 集群为 QPS 而非数据量扩容时，可评估 Lavik。也应回放实际集合命令：公开对比测量的是字符串操作，并非哈希、列表或有序集合性能。",
    ),
    retain: bilingual(
      "Keep Pika when its existing operational model and compatibility satisfy your requirements and the measured bottleneck does not appear in your workload. Validate migration, replication and recovery semantics before changing a production storage engine.",
      "如果 Pika 现有运维方式与兼容性满足需求，且实际工作负载中不存在此测试反映的瓶颈，可以保留 Pika。生产环境更换存储引擎前，应验证迁移、复制与恢复语义。",
    ),
    question: bilingual(
      "Why can Lavik cost less when Pika already uses SSD?",
      "Pika 已经使用 SSD，为什么 Lavik 仍可能更省钱？",
    ),
    answer: bilingual(
      "At the same data size and request-rate target, a higher observed QPS per node can reduce the throughput-driven node count. The calculator assumes usable capacity, node prices and scaling efficiency; it is a sizing illustration, not a measured multi-node cluster result.",
      "在相同数据量与请求速率目标下，更高的实测单机 QPS 可以减少由吞吐量决定的节点数。计算器对可用容量、节点价格与扩展效率作出假设；这是容量规划示例，并非多节点集群的实测结果。",
    ),
    sources: ["tiering-report", "pika-readme", "lavik-beta-storage"],
  },
  kvrocks: {
    angle: bilingual(
      "Redis data on disk. More QPS per measured server.",
      "Redis 数据放上磁盘，实测单机 QPS 更高。",
    ),
    summary: bilingual(
      "Lavik vs Apache Kvrocks: measured NVMe SSD throughput and p99, Redis data structures on disk, maintenance tradeoffs, and a node-count cost model.",
      "Lavik 与 Apache Kvrocks 对比：NVMe SSD 实测吞吐量与 p99、磁盘上的 Redis 数据结构、维护取舍及节点数成本模型。",
    ),
    tested: "Apache Kvrocks 2.16.0 · RocksDB / BlobDB",
    design: bilingual(
      "Kvrocks encodes Redis data structures into RocksDB keys and column families. Lavik uses its own record and collection representations with memory indexes and asynchronous storage. Both can move substantial value capacity away from DRAM; Lavik's differentiator here is measured service rate and tail latency.",
      "Kvrocks 将 Redis 数据结构编码为 RocksDB 键与列族。Lavik 采用自有记录和集合表示、内存索引与异步存储。两者都能让大量值容量脱离 DRAM；本次 Lavik 的差异化优势在于实测服务速率与尾延迟。",
    ),
    consequence: bilingual(
      "Collection support is not unique to Lavik: Kvrocks documents hashes, lists, sets and sorted sets on RocksDB. The engineering choice is how each representation behaves under your read/update mix, cache budget and background maintenance. The table below measures identical string workloads on the same local hardware.",
      "集合支持并非 Lavik 独有：Kvrocks 文档介绍了 RocksDB 上的哈希、列表、集合与有序集合。工程选择在于不同表示方式如何应对实际读写比例、缓存预算与后台维护。下表在相同本地硬件上测量相同字符串负载。",
    ),
    nuance: bilingual(
      "Kvrocks used 16 workers, an 80 GiB block cache, BlobDB and RAID0/XFS. WAL, per-write sync, compression and Blob GC were disabled; ordinary flush and automatic compaction remained enabled. Disabling those durability/maintenance features changes the operational contract. Do not interpret the result as equal durability or sustained long-term space reclamation.",
      "Kvrocks 使用 16 个工作线程、80 GiB 块缓存、BlobDB 和 RAID0/XFS。WAL、逐次写入同步、压缩及 Blob GC 被关闭，常规刷盘与自动压缩整理保持开启。关闭这些持久性或维护功能会改变运维语义；不能据此认定持久性相同或长期空间回收表现相同。",
    ),
    choose: bilingual(
      "Evaluate Lavik when SSD is already the right capacity medium but random-read latency or QPS is limiting your Kvrocks deployment. Include overwrite churn and disk-space recovery in a longer test so the node savings survive steady-state operation.",
      "如果 SSD 已是合适的容量介质，但随机读取延迟或 QPS 限制了 Kvrocks 部署，可评估 Lavik。请在更长测试中加入持续覆盖写与磁盘空间回收，确认节点节省在稳态运行下依然成立。",
    ),
    retain: bilingual(
      "Retain Kvrocks when its RocksDB-based operating model, commands and existing tooling fit your application and your latency target is already met. Budget the migration around real command semantics and recovery behavior, not only a GET chart.",
      "如果 Kvrocks 基于 RocksDB 的运维方式、命令和现有工具适合应用，且已满足延迟目标，可以继续使用。应按真实命令语义与恢复行为规划迁移，而非仅依据 GET 图表。",
    ),
    question: bilingual(
      "Is Kvrocks just an in-memory database with a disk cache?",
      "Kvrocks 只是加了磁盘缓存的内存数据库吗？",
    ),
    answer: bilingual(
      "No. Apache Kvrocks uses RocksDB as its storage engine and maps Redis data structures onto it. Lavik is an alternative disk-capable architecture; this comparison evaluates throughput and latency, not whether only one system can store collections on disk.",
      "不是。Apache Kvrocks 使用 RocksDB 作为存储引擎，并将 Redis 数据结构映射到它。Lavik 是另一种支持磁盘的架构；对比重点在吞吐量和延迟，而非声称只有一方能将集合存入磁盘。",
    ),
    sources: ["tiering-report", "kvrocks-structures", "lavik-beta-storage"],
  },
  tendis: {
    angle: bilingual(
      "Higher measured throughput for a disk-backed Redis workload.",
      "面向磁盘 Redis 负载，提供更高实测吞吐量。",
    ),
    summary: bilingual(
      "Lavik vs Tencent Tendis: NVMe SSD read/write benchmarks, RocksDB and native storage differences, cluster evaluation criteria, and cost assumptions.",
      "Lavik 与腾讯 Tendis 对比：NVMe SSD 读写基准、RocksDB 与自有存储差异、集群评估要点及成本假设。",
    ),
    tested: "Tendis 2.8.4-rocksdb-v8.5.3",
    design: bilingual(
      "The tested open-source Tendis server stores data through RocksDB and exposes a Redis-compatible interface. Its repository also describes use within Tendis Hybrid Storage Edition; this benchmark measures the specific standalone Tendis binary, not that complete hybrid deployment or a managed cloud service.",
      "测试中的开源 Tendis 服务端通过 RocksDB 存储数据，暴露 Redis 兼容接口。其仓库还介绍了它在 Tendis 混合存储版中的用途；本基准测量的是指定的独立 Tendis 程序，而非完整混合部署或托管云服务。",
    ),
    consequence: bilingual(
      "Both designs aim to escape DRAM capacity limits. Lavik's measured QPS advantage matters when enough SSD bytes are available but your cluster still needs more servers to handle reads and writes. Higher per-node capacity to serve requests can change the budget even if both products use identical SSD prices.",
      "两种设计都旨在突破 DRAM 容量限制。当 SSD 空间充足，但集群仍需更多服务器处理读写时，Lavik 的实测 QPS 优势就有价值。即使 SSD 单价相同，更高的单机请求处理能力仍可能改变成本。",
    ),
    nuance: bilingual(
      "The Tendis run used ten RocksDB stores sharing a 72 GiB block/blob cache. WAL, binlog, per-transaction log flush and compression were disabled; automatic compaction and Blob GC stayed enabled. No additional warmup or compaction wait was added after loading. Cluster membership and failover were not benchmarked.",
      "Tendis 测试使用 10 个 RocksDB 存储实例，共享 72 GiB 块/Blob 缓存。WAL、binlog、逐事务日志刷盘与压缩被关闭，自动压缩整理和 Blob GC 保持开启。加载后没有额外预热或等待压缩整理。基准未测试集群成员管理与故障切换。",
    ),
    choose: bilingual(
      "Evaluate Lavik for a large, broadly accessed dataset when serving rate determines the size of your Tendis fleet. In addition to the data-plane benchmark, exercise client routing, replica recovery and failure handling with the documented Lavik deployment model.",
      "当大规模、访问广泛的数据集使服务速率决定 Tendis 集群规模时，可评估 Lavik。除数据面基准外，还应按照 Lavik 文档中的部署模型验证客户端路由、副本恢复与故障处理。",
    ),
    retain: bilingual(
      "Keep Tendis when its established cluster behavior and operational tooling are central to your system and the throughput target is already satisfied. A single-server benchmark cannot establish that two products have interchangeable failover semantics.",
      "如果 Tendis 既有集群行为与运维工具是系统的重要组成部分，且吞吐量已满足要求，可以保留 Tendis。单机基准不能证明两个产品的故障切换语义可以互换。",
    ),
    question: bilingual(
      "Does the Tendis comparison prove fewer Lavik nodes meet the same SLA?",
      "Tendis 对比能否证明更少 Lavik 节点满足相同 SLA？",
    ),
    answer: bilingual(
      "It supplies measured single-server QPS and latency. The node estimate assumes balanced sharding, linear scaling and explicit capacity/headroom. It does not establish cluster failure behavior, equal crash durability, or an application P99.99 SLA.",
      "它提供实测单机 QPS 与延迟。节点估算假设分片均衡、线性扩展，并明确容量与余量；它不能证明集群故障行为、相同崩溃持久性或应用 P99.99 SLA。",
    ),
    sources: ["tiering-report", "tendis-readme", "lavik-beta-storage"],
  },
  keydb: {
    angle: bilingual(
      "When the working set is too broad for the hot tier.",
      "当工作集过于分散，热点层不再足够。",
    ),
    summary: bilingual(
      "Lavik vs KeyDB On Flash: uniform-access SSD benchmark results, the importance of hot-set locality, experimental feature scope, and transparent cost modeling.",
      "Lavik 与 KeyDB On Flash 对比：均匀访问 SSD 基准、热点局部性的影响、实验性功能范围及透明成本建模。",
    ),
    tested: "KeyDB 6.3.4 · On Flash (experimental)",
    design: bilingual(
      "KeyDB On Flash is a RocksDB-backed feature that retains hot data in DRAM and can stream larger values from flash. Its documentation labels it beta/experimental. The measured configuration used a 64 GiB hot tier with allkeys-lru. This page compares On Flash, not ordinary in-memory KeyDB performance.",
      "KeyDB On Flash 基于 RocksDB，将热点数据保留在 DRAM，并可从闪存流式读取较大的值。官方文档将其标为 beta/实验性功能。测试配置使用 64 GiB 热点层与 allkeys-lru。本页比较 On Flash，而非普通内存模式 KeyDB 的性能。",
    ),
    consequence: bilingual(
      "Uniform random access across 200 million keys makes a small hot tier less effective. That is a useful stress case for long-tail caches, broad feature retrieval and machine-generated profiles. Lavik's stronger result in this case is a reason to test it when locality is weak, not a claim that all KeyDB applications behave this way.",
      "在 2 亿键上均匀随机访问，会削弱小热点层的作用。这对长尾缓存、广泛特征检索与机器生成画像是有用的压力场景。Lavik 在此情况下的优势支持在局部性弱时进行评估，而不代表所有 KeyDB 应用都如此。",
    ),
    nuance: bilingual(
      "The report explicitly says this access pattern differs from KeyDB On Flash's recommended hot-key workload. KeyDB retained its RocksDB WAL and automatic compaction, while some other controls disabled WAL. It used four server threads, with no extra warmup or background-organization wait. The very large ratio belongs to this configuration and distribution only.",
      "报告明确说明，此访问模式不同于 KeyDB On Flash 推荐的热点键负载。KeyDB 保留了 RocksDB WAL 与自动压缩整理，而部分其他对照组关闭了 WAL。测试使用 4 个服务线程，没有额外预热或等待后台整理。很大的性能比值仅适用于此配置和分布。",
    ),
    choose: bilingual(
      "Prioritize Lavik when a broad active keyspace prevents a DRAM hot tier from absorbing most requests. Model the node-count implication, then validate with both your actual popularity distribution and a cold-start or cache-churn interval.",
      "当活跃键空间广泛，DRAM 热点层无法吸收大部分请求时，可优先评估 Lavik。先计算节点数量影响，再用真实访问热度分布及冷启动或缓存快速变化阶段验证。",
    ),
    retain: bilingual(
      "Retain KeyDB On Flash as a candidate when a small, stable hot set dominates traffic and its experimental status fits your deployment requirements. The uniform benchmark deliberately removes that locality advantage, so a production-like replay is essential.",
      "如果少量稳定热点承担主要流量，且实验性状态符合部署要求，可以保留 KeyDB On Flash 作为候选。均匀访问基准有意消除了这一局部性优势，因此必须进行接近生产的回放。",
    ),
    question: bilingual(
      "Does this mean KeyDB itself is always much slower?",
      "这是否说明 KeyDB 本身总是慢很多？",
    ),
    answer: bilingual(
      "No. These numbers concern KeyDB 6.3.4 On Flash with a 64 GiB hot tier and uniform access over 200 million keys. They do not rank in-memory KeyDB or a hot-key-heavy workload. Cost estimates inherit that same limitation.",
      "不是。这些数据针对 KeyDB 6.3.4 On Flash、64 GiB 热点层和 2 亿键上的均匀访问，不能用于评价内存模式 KeyDB 或高度集中的热点负载。成本估算也受相同限制。",
    ),
    sources: [
      "tiering-report",
      "keydb-flash",
      "keydb-sizing",
      "lavik-beta-storage",
    ],
  },
};
export function comparisonFaq(id: ProductId, locale: Locale) {
  const copy = comparisonCopy[id],
    zh = locale === "zh-CN";
  return [
    { question: copy.question[locale], answer: copy.answer[locale] },
    {
      question: zh
        ? "使用 Lavik 需要改用新协议吗？"
        : "Does Lavik require a new application protocol?",
      answer: zh
        ? "不需要。Lavik 接受 Redis/Valkey 兼容命令，默认 RESP2，也可协商 RESP3。请根据 beta.1 的命令参考、客户端兼容性和迁移指南验证具体行为；协议兼容不等于所有命令、模块或故障切换行为完全相同。"
        : "No. Lavik accepts Redis/Valkey-compatible commands, with RESP2 by default and negotiable RESP3. Verify exact behavior against the beta.1 command reference, client compatibility and migration guides; protocol compatibility does not mean every command, module or failover behavior is identical.",
    },
    {
      question: zh
        ? "如何把单机结果用于成本评估？"
        : "How should I use a single-server benchmark for cost planning?",
      answer: zh
        ? "先选择匹配实际读写比例与延迟预算的实测点，再同时考虑数据容量和 QPS 所需节点数。把索引内存、复制、容量余量与故障场景纳入真实回放。页面成本模型是明确假设下的规划示例，不是多节点集群实测或云服务报价。"
        : "Select an observed point matching your read/write mix and latency budget, then account for both capacity-driven and QPS-driven node counts. Include index memory, replication, headroom and failures in your replay. The page's cost model is an explicit planning illustration, not a measured cluster result or cloud quote.",
    },
  ];
}
