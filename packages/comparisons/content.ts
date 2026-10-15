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
    angle: b(
      "Redis performance without a DRAM-sized capacity bill.",
      "Redis 级体验，无需按 DRAM 价格扩充容量。",
    ),
    summary: b(
      "Lavik 0.1.0 puts values on NVMe SSD and delivers higher peak GET and SET throughput than Redis 8.10.2 in our 16-vCPU benchmark. Keep the Redis interface as your dataset grows.",
      "Lavik 0.1.0 将值存入 NVMe SSD，在 16 vCPU 基准测试中实现了高于 Redis 8.10.2 的 GET 与 SET 峰值吞吐量，让数据增长继续沿用熟悉的 Redis 接口。",
    ),
    tested: "Redis 8.10.2 · DRAM",
    design: b(
      "Redis serves this dataset from DRAM. Lavik keeps a compact key index in memory and stores values on NVMe SSD. A GET still arrives through a Redis client; the storage engine does the work of finding and reading the value.",
      "Redis 从 DRAM 提供本次数据集。Lavik 将紧凑键索引保留在内存，值存于 NVMe SSD。GET 仍通过 Redis 客户端发出，由存储引擎定位并读取值。",
    ),
    consequence: b(
      "A cache should grow because keeping more data improves the application—not because the team can afford another memory-heavy shard. Lavik gives product catalogs, cached API responses and feature records room to grow while preserving familiar reads, writes and TTLs.",
      "缓存规模应由保留数据对应用的价值决定。Lavik 让商品目录、API 响应缓存与特征记录拥有更大的容量空间，同时保留熟悉的读写与 TTL 操作。",
    ),
    nuance: b(
      "October 13, 2026: 10M keys × 1 KiB, pipeline 1, 30-second windows. All displayed peaks use 1,280 connections. Redis AOF and scheduled snapshots are disabled. Values come from archived memtier JSON outputs; latency is p99.9 at the same point.",
      "2026-10-13：1,000 万键 × 1 KiB，pipeline 1，每点 30 秒。展示的峰值均为 1,280 个连接。Redis 关闭 AOF 与定时快照。数值来自归档的 memtier JSON 输出；p99.9 与吞吐量来自同一测量点。",
    ),
    choose: b(
      "Start with the Redis dataset that costs the most to keep in memory: a large cache, a growing profile store or a feature-serving layer. The larger the value payload, the more capacity cost can move from DRAM to SSD.",
      "先迁移内存成本最突出的数据集：大容量缓存、增长中的画像或在线特征。值数据越大，可从 DRAM 转向 SSD 的容量成本越多。",
    ),
    retain: b(
      "Run Lavik 0.1.0, point a test instance of your existing client at it, then use RedisShake for a full copy and incremental catch-up. Compare counts and sampled values before moving traffic; keep the source available through cutover.",
      "启动 Lavik 0.1.0，接入现有客户端的测试实例，再使用 RedisShake 完成全量复制与增量追赶。切流前核对键数和抽样值，并在切换期间保留源端。",
    ),
    question: b(
      "Where does the 20× capacity-cost saving come from?",
      "20 倍容量成本优势来自哪里？",
    ),
    answer: b(
      "Values move from DRAM to NVMe SSD. At a 20:1 price per GiB, the same value capacity costs 95% less. Add index memory, replicas and the rest of the server to estimate the complete deployment.",
      "值容量从 DRAM 转到 NVMe SSD。按每 GiB 单价 20:1 计算，相同值容量的介质成本降低 95%。估算完整部署时，再计入索引内存、副本及服务器其余成本。",
    ),
    sources: ["stable-memory", "stable-overview", "stable-storage-design"],
  },
  valkey: {
    angle: b(
      "Keep your clients. Give your data more room.",
      "保留客户端，让数据拥有更大空间。",
    ),
    summary: b(
      "Compare Lavik 0.1.0 with Valkey 9.1.2: higher peak GET and SET throughput in the 16-vCPU test, with values on NVMe SSD instead of DRAM.",
      "对比 Lavik 0.1.0 与 Valkey 9.1.2：在 16 vCPU 测试中实现更高的 GET、SET 峰值吞吐量，值存储使用 NVMe SSD。",
    ),
    tested: "Valkey 9.1.2 · DRAM",
    design: b(
      "Valkey is an in-memory store in this comparison. Lavik changes where values live, while keeping the RESP interface that Redis and Valkey clients use. Key indexes and request buffers stay in memory; values can grow beyond RAM.",
      "本次对比中的 Valkey 使用内存存储。Lavik 改变值的存储位置，同时保留 Redis、Valkey 客户端使用的 RESP 接口。键索引与请求缓冲留在内存，值容量可超越内存大小。",
    ),
    consequence: b(
      "Longer session retention, larger catalogs and more features per entity all expand stored bytes. Lavik lets those datasets use SSD capacity without introducing a new client protocol or a separate application-managed cold store.",
      "更长的会话保留期、更大的目录与更多实体特征都会增加存储量。Lavik 用 SSD 承载这些数据，无需引入新客户端协议或由应用另行管理冷数据存储。",
    ),
    nuance: b(
      "The October 13 test uses 10M keys, 1 KiB values and 16 vCPUs. Valkey GET uses 16 I/O threads; SET uses eight. The smaller-instance report is a separate experiment. Full curves show how throughput and p99.9 change with load.",
      "10 月 13 日测试使用 1,000 万键、1 KiB 值与 16 vCPU。Valkey GET 使用 16 个 I/O 线程，SET 使用 8 个。小型实例报告属于独立实验；完整曲线展示吞吐量和 p99.9 随负载的变化。",
    ),
    choose: b(
      "Use Lavik when retention or value size drives the memory bill. Start with your normal client and command mix, then increase the dataset to the size you want to retain—not merely the size that currently fits in RAM.",
      "当保留期或值大小推动内存账单时，采用 Lavik。使用现有客户端与命令组合，将数据集扩大到业务希望保留的规模。",
    ),
    retain: b(
      "Use the client-library guide to check your connection, pipelining and reconnect settings. Rehearse the migration and traffic switch on a representative dataset, then use the same measurements for production sizing.",
      "根据客户端指南检查连接、流水线与重连配置。在代表性数据集上演练迁移和切流，再用同样的测量方式规划生产容量。",
    ),
    question: b(
      "Can I keep my Redis or Valkey client?",
      "可以继续使用 Redis 或 Valkey 客户端吗？",
    ),
    answer: b(
      "Lavik supports RESP2 and RESP3. Use the 0.1.0 command reference and tested client-library profiles to map the operations your application uses, including scripts, transactions and expiry.",
      "Lavik 支持 RESP2 与 RESP3。使用 0.1.0 命令参考和客户端兼容指南，确认应用所需的脚本、事务、过期及其他操作。",
    ),
    sources: ["stable-memory", "stable-overview", "stable-storage-design"],
  },
  dragonfly: {
    angle: b(
      "Read the long tail without the long wait.",
      "读取长尾数据，不必漫长等待。",
    ),
    summary: b(
      "At one billion keys and 80 connections, Lavik delivers 1.88× DragonflyDB GET throughput with 0.439 ms p99.9. Compare the SSD paths, large-dataset results and server-count implications.",
      "十亿键、80 个连接下，Lavik 的 GET 吞吐量为 DragonflyDB 的 1.88 倍，p99.9 为 0.439 ms。比较 SSD 路径、大数据集表现与所需节点数。",
    ),
    tested: "Dragonfly 2.0.2 · SSD tiering",
    design: b(
      "Dragonfly moves values between memory and its SSD tier. Lavik uses an SSD-capable storage engine with a memory key index and asynchronous reads. Its workers continue processing other requests while NVMe I/O is in flight.",
      "Dragonfly 在内存与 SSD 层之间移动值。Lavik 使用内存键索引与支持 SSD 的存储引擎，通过异步读取让工作线程在 NVMe I/O 进行时继续处理其他请求。",
    ),
    consequence: b(
      "When reads span a billion-key catalog, cache locality cannot carry the whole workload. Lavik’s measured GET tail at the matched point is 0.439 ms versus Dragonfly’s 11.071 ms—more room for the rest of an API, recommendation or profile lookup.",
      "当读取覆盖十亿键目录时，缓存局部性无法独自承担全部负载。在相同测量点，Lavik GET 尾延迟为 0.439 ms，Dragonfly 为 11.071 ms，为 API、推荐或画像查询的其他环节留出更多时间。",
    ),
    nuance: b(
      "October 14: one billion 1 KiB values, 16 vCPUs, six NVMe devices, 80 connections, pipeline 1 and 60-second windows. Dragonfly receives a 180-second GET warmup. Storage layout, memory budgets and persistence settings are documented in the report.",
      "10 月 14 日：十亿个 1 KiB 值、16 vCPU、六块 NVMe、80 个连接、pipeline 1、60 秒窗口。Dragonfly 进行 180 秒 GET 预热。存储布局、内存预算及持久化配置见报告。",
    ),
    choose: b(
      "Choose Lavik for broad-access caches and online state that keeps growing beyond RAM. Its SSD storage also covers strings, hashes, lists, sets, sorted sets and streams, with grouped representations for large objects.",
      "选择 Lavik 承载超出内存且访问范围广的缓存与在线状态。SSD 存储覆盖字符串、哈希、列表、集合、有序集合及流，大对象采用分组表示。",
    ),
    retain: b(
      "Move one representative dataset first. Replay the real read distribution, including low-locality reads, and compare delivered QPS at the required tail latency. Use that operating point to size the deployment.",
      "先迁移一个代表性数据集，回放包含低局部性读取的真实请求分布，按所需尾延迟比较有效 QPS，再据此规划部署规模。",
    ),
    question: b(
      "Does Lavik put Redis collections on SSD too?",
      "Lavik 也能将 Redis 集合存入 SSD 吗？",
    ),
    answer: b(
      "Yes. Lavik 0.1.0 supports SSD-backed payloads across strings, hashes, lists, sets, sorted sets and streams. Dragonfly’s documented tiering includes strings and experimental list/hash paths; the comparison here measures string GET/SET.",
      "可以。Lavik 0.1.0 的 SSD 值存储覆盖字符串、哈希、列表、集合、有序集合和流。Dragonfly 文档包含字符串及实验性列表、哈希分层；本页性能比较使用字符串 GET/SET。",
    ),
    sources: ["stable-storage", "stable-collections", "dragonfly-docs"],
  },
  garnet: {
    angle: b(
      "More read throughput from the same SSD fleet.",
      "相同 SSD 资源，提供更高读取吞吐量。",
    ),
    summary: b(
      "Lavik vs Garnet 2.2.1 at a billion keys: 385,514 versus 217,523 GET QPS at 80 connections, with p99.9 of 0.439 versus 4.703 ms.",
      "十亿键下对比 Lavik 与 Garnet 2.2.1：80 个连接时 GET QPS 为 385,514 与 217,523，p99.9 为 0.439 与 4.703 ms。",
    ),
    tested: "Garnet 2.2.1 · storage enabled",
    design: b(
      "Garnet’s log-structured storage and Lavik’s NVMe storage engine make different choices about indexing, caching and data organization. Lavik couples worker-owned state with asynchronous I/O and grouped storage for large Redis objects.",
      "Garnet 的日志结构存储与 Lavik 的 NVMe 存储引擎在索引、缓存和数据组织上采用不同设计。Lavik 将工作线程本地状态、异步 I/O 与大 Redis 对象的分组存储结合。",
    ),
    consequence: b(
      "Read-heavy catalogs and feature stores need more than enough bytes on disk. At the matched point, Lavik delivers 1.77× GET throughput and a substantially shorter read tail, reducing the throughput-driven node count in a sizing model.",
      "以读为主的目录与特征库不仅需要足够磁盘空间。在相同测量点，Lavik 提供 1.77 倍 GET 吞吐量与明显更短的读取尾延迟，可降低容量规划中由吞吐量决定的节点需求。",
    ),
    nuance: b(
      "The table compares the same 80 connections. Garnet has the highest SET peak across the full sweep, at 900,794 QPS. Use the complete report for a write-heavy deployment; the calculator uses only the displayed points.",
      "表格比较相同的 80 个连接。完整扫描中，Garnet 的 SET 峰值最高，为 900,794 QPS。写入密集部署请结合完整报告；计算器仅使用所展示的测量点。",
    ),
    choose: b(
      "Use Lavik when large-dataset reads and predictable read latency are central to the application. Check the same read distribution and command mix at the full retention size.",
      "当大数据集读取和读取延迟是应用核心需求时，采用 Lavik，并在完整保留规模下检查真实读取分布与命令组合。",
    ),
    retain: b(
      "Run the read/write mix that drives your production bill. Measure both tail latency and throughput, include background maintenance, and translate the accepted point into server and replica requirements.",
      "运行决定生产成本的读写组合，同时测量尾延迟和吞吐量，包含后台维护，再将满足要求的运行点转化为服务器与副本需求。",
    ),
    question: b(
      "How can using fewer servers reduce cost?",
      "减少服务器如何降低成本？",
    ),
    answer: b(
      "If capacity is already sufficient, serving more requests per primary can reduce the number of primaries required for a target QPS. The model below includes usable capacity, headroom, replicas and node prices; it is a planning calculation rather than a measured cluster result.",
      "当容量足够时，每个主节点处理更多请求可减少达到目标 QPS 所需的主节点数。下方模型计入可用容量、余量、副本与节点价格，属于规划计算。",
    ),
    sources: ["stable-storage", "stable-collections", "garnet-features"],
  },
  pika: {
    angle: b(
      "Serve a billion keys with fewer read bottlenecks.",
      "十亿键规模，减少读取瓶颈。",
    ),
    summary: b(
      "Lavik delivers 3.62× Pika GET throughput and 4.60× SET throughput at the same 80 connections in the October billion-key benchmark.",
      "10 月十亿键基准中，在相同 80 个连接下，Lavik GET 吞吐量为 Pika 的 3.62 倍，SET 为 4.60 倍。",
    ),
    tested: "Pika 3.5.7 release archive",
    design: b(
      "Pika uses RocksDB to give Redis-compatible workloads disk capacity. Lavik takes an NVMe-oriented path: a compact in-memory key index, asynchronous storage I/O and worker-local request execution.",
      "Pika 使用 RocksDB 为 Redis 兼容负载提供磁盘容量。Lavik 采用面向 NVMe 的路径：紧凑内存键索引、异步存储 I/O 与工作线程本地执行。",
    ),
    consequence: b(
      "At 80 connections, Lavik serves 385,514 GET QPS versus 106,451 for Pika, with p99.9 of 0.439 versus 2.479 ms. For a fixed dataset and request rate, higher per-node throughput can reduce the fleet you need to operate.",
      "80 个连接时，Lavik GET 为 385,514 QPS，Pika 为 106,451；p99.9 分别为 0.439 与 2.479 ms。对于固定数据集和请求速率，更高单节点吞吐量可减少需要运维的节点。",
    ),
    nuance: b(
      "The report uses Pika’s 3.5.7 release archive; its embedded version reports 3.5.6. Binlog is disabled. Both systems use one billion 1 KiB values; the report lists the complete cache, background-work and durability configuration.",
      "报告使用 Pika 3.5.7 发布包，其内嵌版本标识为 3.5.6；binlog 关闭。两者均使用十亿个 1 KiB 值，完整缓存、后台工作与持久化配置见报告。",
    ),
    choose: b(
      "Bring large caches, user profiles and lookup-heavy application state to Lavik when SSD capacity is already essential and you want more work from each server.",
      "当 SSD 容量已经必不可少、又希望提高每台服务器产出时，将大缓存、用户画像与查询密集应用状态迁至 Lavik。",
    ),
    retain: b(
      "Map the commands and TTL behavior your service uses, move a representative key range, and measure the workload with background maintenance active before expanding the rollout.",
      "核对服务使用的命令和 TTL 行为，迁移代表性键范围，并在后台维护开启时测量负载，再扩大部署。",
    ),
    question: b(
      "Is this the stable Lavik release?",
      "本页使用的是 Lavik 稳定版吗？",
    ),
    answer: b(
      "Yes. These October results use the downloadable Lavik 0.1.0 Standard package with SPDK. The matching report includes the release identity, hardware, configurations and reproduction commands.",
      "是。10 月结果使用可下载的 Lavik 0.1.0 Standard 包及 SPDK。对应报告包含发布版本、硬件、配置与复现命令。",
    ),
    sources: ["stable-storage", "stable-storage-design", "pika-readme"],
  },
  kvrocks: {
    angle: b(
      "SSD capacity with a much faster read path.",
      "SSD 容量，更快的读取路径。",
    ),
    summary: b(
      "Compare Lavik with Apache Kvrocks 2.17.0: 8.62× GET throughput at 80 connections, on a billion-key dataset stored across six NVMe SSDs.",
      "对比 Lavik 与 Apache Kvrocks 2.17.0：十亿键分布于六块 NVMe SSD，在 80 个连接下 GET 吞吐量达到 8.62 倍。",
    ),
    tested: "Apache Kvrocks 2.17.0 · RocksDB",
    design: b(
      "Apache Kvrocks exposes Redis-compatible data structures over RocksDB. Lavik uses its own storage engine, with in-memory key lookup and asynchronous reads from NVMe SSD. Its grouped representation keeps large-object operations focused on the relevant records.",
      "Apache Kvrocks 在 RocksDB 上提供 Redis 兼容数据结构。Lavik 使用自有存储引擎，在内存中定位键并异步读取 NVMe SSD；分组表示让大对象操作聚焦相关记录。",
    ),
    consequence: b(
      "A profile or feature lookup is often on the critical request path. In the matched test, Lavik reaches 385,514 GET QPS at 0.439 ms p99.9; Kvrocks reaches 44,737 at 5.599 ms. This is a concrete starting point for read-heavy capacity planning.",
      "画像或特征查询往往位于请求关键路径。在相同测量点，Lavik GET 为 385,514 QPS、p99.9 0.439 ms；Kvrocks 为 44,737 QPS、5.599 ms，为读密集容量规划提供直接依据。",
    ),
    nuance: b(
      "One billion keys, 1 KiB values and 80 connections. Kvrocks WAL is disabled in this benchmark. Its SET p99.9 is lower at this point, while Lavik delivers more SET throughput. The report specifies cache and compaction settings.",
      "十亿键、1 KiB 值、80 个连接。本次 Kvrocks 关闭 WAL；该点的 SET p99.9 更低，而 Lavik SET 吞吐量更高。缓存与 compaction 配置详见报告。",
    ),
    choose: b(
      "Choose Lavik for a larger online dataset whose reads must remain fast as more values live on SSD. Broad key access and feature-serving fan-out are good first workloads to evaluate.",
      "当更大在线数据集需要在值驻留 SSD 后继续快速读取时，选择 Lavik。广泛键访问与在线特征扇出查询适合优先试用。",
    ),
    retain: b(
      "Replay your actual key popularity and read/write mix, then include expiration and background maintenance. Use the migration guide to plan transfer, validation and cutover.",
      "回放实际键热度和读写组合，再加入过期及后台维护。根据迁移指南规划数据传输、验证与切流。",
    ),
    question: b("Does Lavik use RocksDB?", "Lavik 使用 RocksDB 吗？"),
    answer: b(
      "Lavik’s Data storage engine is built around its own key index, grouped values and asynchronous I/O paths. It supports io_uring and SPDK storage backends. This comparison measures the SPDK path.",
      "Lavik Data 存储引擎采用自有键索引、分组值表示与异步 I/O 路径，支持 io_uring 和 SPDK 存储后端。本次比较使用 SPDK。",
    ),
    sources: ["stable-storage", "stable-storage-design", "kvrocks-structures"],
  },
  tendis: {
    angle: b(
      "Keep disk capacity. Raise the read ceiling.",
      "保留磁盘容量，提升读取吞吐量。",
    ),
    summary: b(
      "Lavik vs Tendis 2.8.4: 8.64× GET throughput at the same 80 connections, with a 0.439 ms GET p99.9 on a billion-key dataset.",
      "Lavik 对比 Tendis 2.8.4：相同 80 个连接下 GET 吞吐量达到 8.64 倍，十亿键数据集的 GET p99.9 为 0.439 ms。",
    ),
    tested: "Tendis 2.8.4 · RocksDB 8.5.3",
    design: b(
      "Tendis uses RocksDB for disk-backed Redis-compatible storage. Lavik’s worker-owned key indexes and asynchronous NVMe reads give a different path from incoming command to stored value.",
      "Tendis 使用 RocksDB 提供磁盘上的 Redis 兼容存储。Lavik 的工作线程本地键索引与异步 NVMe 读取，为命令访问存储值提供另一条路径。",
    ),
    consequence: b(
      "At the matched point, Lavik serves 385,514 GET QPS versus 44,614 for Tendis. Read p99.9 is 0.439 versus 58.879 ms. That difference matters when a single API request depends on several profile, catalog or feature lookups.",
      "在相同测量点，Lavik GET 为 385,514 QPS，Tendis 为 44,614；读取 p99.9 为 0.439 与 58.879 ms。当一个 API 请求依赖多次画像、目录或特征查询时，这一差异尤为重要。",
    ),
    nuance: b(
      "The October test uses one billion 1 KiB values. Tendis WAL is disabled. Tendis has lower SET p99.9 at 80 connections; Lavik has higher SET QPS. Cache budgets, maintenance and persistence settings are in the source report.",
      "10 月测试使用十亿个 1 KiB 值，Tendis 关闭 WAL。在 80 个连接下，Tendis SET p99.9 更低，Lavik SET QPS 更高。缓存预算、维护与持久化配置见报告。",
    ),
    choose: b(
      "Use Lavik for disk-resident online state where read throughput and read-tail latency determine the customer experience. Start with the dataset whose growth is forcing additional serving nodes.",
      "对于读取吞吐量和尾延迟直接影响用户体验的磁盘在线状态，采用 Lavik。优先从数据增长迫使增加服务节点的数据集开始。",
    ),
    retain: b(
      "Confirm the command surface, then rehearse a representative migration with the source available. Compare target-load latency and capacity before the final traffic switch.",
      "确认命令兼容范围，在保留源端的条件下演练代表性迁移；最终切流前比较目标负载下的延迟与容量。",
    ),
    question: b(
      "What should I compare besides QPS?",
      "除了 QPS，还应比较什么？",
    ),
    answer: b(
      "Compare the same retained dataset, command mix, read distribution, p99.9 target and recovery policy. Then include index memory, replicas and failure headroom in the server count. The calculator makes the throughput and capacity constraints explicit.",
      "比较相同保留数据集、命令组合、读取分布、p99.9 目标和恢复策略，再将索引内存、副本与故障余量计入节点数量。计算器明确展示吞吐量与容量两种约束。",
    ),
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
        ? "不需要。Lavik 支持 RESP2 与 RESP3；请用 0.1.0 命令参考和客户端兼容指南确认应用需要的操作，再按 RedisShake 迁移指南完成 Redis 源端的数据复制与切流。" +
          (id === "redis"
            ? ""
            : " 对于其他产品，先确认 RedisShake 支持源端的 RDB 格式与复制流。")
        : "No. Lavik supports RESP2 and RESP3. Check your application’s operations against the 0.1.0 command reference and client-library guide, then follow the RedisShake migration guide for Redis-source transfer and cutover." +
          (id === "redis"
            ? ""
            : " For other products, first confirm that RedisShake supports the source RDB format and replication stream."),
    },
    {
      question: zh ? "如何开始试用？" : "How do I start?",
      answer: zh
        ? "通过 APT、Docker 或二进制安装 Lavik 0.1.0，连接客户端，加载一个代表性数据集。快速入门、运维及监控文档覆盖从首次启动到日常管理的步骤。"
        : "Install Lavik 0.1.0 with APT, Docker or a binary, connect your client, and load a representative dataset. The quick start, operations and monitoring guides take you from first launch to daily management.",
    },
  ];
}
