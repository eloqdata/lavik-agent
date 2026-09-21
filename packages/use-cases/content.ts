import { z } from "zod";
const text = z
  .object({ en: z.string().min(1), "zh-CN": z.string().min(1) })
  .strict();
const b = (en: string, zh: string) => ({ en, "zh-CN": zh });
const decision = (en: string, zh: string, body: string, bodyZh: string) => ({
  title: b(en, zh),
  body: b(body, bodyZh),
});
const trial = (
  en: string,
  zh: string,
  measure: string,
  measureZh: string,
  accept: string,
  acceptZh: string,
) => ({
  title: b(en, zh),
  measure: b(measure, measureZh),
  accept: b(accept, acceptZh),
});
export const useCaseSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    group: z.enum(["workload", "industry"]),
    title: text,
    navSummary: text,
    headline: text,
    summary: text,
    pressure: z.array(text).min(2),
    fit: text,
    valueDriver: text,
    serving: text,
    origin: text,
    equation: text,
    decisions: z.array(z.object({ title: text, body: text }).strict()).min(3),
    trials: z
      .array(z.object({ title: text, measure: text, accept: text }).strict())
      .min(3),
    commands: z.array(z.string()).min(1),
    related: z.array(z.string()).min(1),
    bestFit: text,
    boundary: text,
  })
  .strict();

export const useCases = useCaseSchema.array().parse([
  {
    slug: "large-application-caches",
    group: "workload",
    title: b("Large application caches", "大容量应用缓存"),
    navSummary: b(
      "Keep the long tail without a DRAM-sized bill.",
      "保留长尾数据，降低内存容量成本。",
    ),
    headline: b(
      "Grow your cache.\nControl the memory bill.",
      "缓存持续增长，\n容量成本保持可控。",
    ),
    summary: b(
      "For Redis-backed catalog, content, and API caches whose retained value payload is growing faster than their traffic. Put value capacity on NVMe SSD and evaluate the full request path against your latency budget.",
      "面向 Redis 上的商品、内容和 API 缓存：保留的值数据比流量增长更快。让 NVMe SSD 承载值容量，并用完整请求链路验证延迟预算。",
    ),
    pressure: [
      b(
        "The expensive part of a mature cache is often its long tail: product variants, rendered fragments, tenant-specific responses, and objects that are read infrequently but costly to reconstruct. Shortening TTLs or evicting more aggressively frees memory by sending work back to the origin.",
        "成熟缓存中昂贵的部分往往是长尾：商品变体、渲染片段、租户专属响应，以及读取不频繁但重建昂贵的对象。缩短 TTL 或加大淘汰力度能够释放内存，却会把压力转移回源站。",
      ),
      b(
        "An SSD-backed cache only solves that problem if disk-resident reads still fit the application budget. A warm-cache average hides broad key access, cache churn, and the origin traffic that follows timeouts. Compare useful responses delivered before the deadline, rather than stored bytes alone.",
        "采用 SSD 的缓存只有在磁盘驻留数据的读取仍满足应用预算时，才真正解决问题。热缓存的平均值会掩盖广泛的键访问、缓存更替，以及超时带来的回源流量。应比较截止时间前返回的有效响应，而不仅是存下了多少数据。",
      ),
    ],
    fit: b(
      "Lavik keeps its key index in DRAM and uses NVMe SSD for value storage. That changes the capacity cost of retaining a broader cache while preserving a Redis-compatible request interface. Start with rebuildable cached objects, retain your source of truth, and measure how the added retention changes hit rate and origin load.",
      "Lavik 将键索引保留在 DRAM 中，使用 NVMe SSD 存储值。这改变了保留更大缓存的容量成本，同时保留 Redis 兼容请求接口。优先从可重建的缓存对象开始，保留源数据系统，并测量增加保留量对命中率和源站负载的影响。",
    ),
    valueDriver: b(
      "Retained object payload and expensive origin misses",
      "保留的对象值数据与昂贵的回源未命中",
    ),
    serving: b("API / page-serving service", "API / 页面服务"),
    origin: b(
      "Database or object store + application refresh workers",
      "数据库或对象存储 + 应用刷新任务",
    ),
    equation: b(
      "Value payload ≈ retained objects × average serialized bytes × live cache versions",
      "值数据量 ≈ 保留对象数 × 平均序列化字节数 × 同时保留的缓存版本数",
    ),
    decisions: [
      decision(
        "Keep cache semantics explicit",
        "明确缓存语义",
        "Define cache-aside reads, expiry, invalidation, and the stale-value policy in the application. Use versioned keys when a schema or rendering revision changes. Coalesce concurrent misses and bound origin retries so a flush or expiry wave cannot amplify an outage.",
        "在应用中定义旁路缓存读取、过期、失效处理和旧值策略。模式或渲染版本变化时使用带版本的键。合并并发未命中并限制回源重试，避免清空或集中到期放大故障。",
      ),
      decision(
        "Budget fan-out and response size",
        "为扇出与响应大小预留预算",
        "A page that performs multiple serial lookups has less time available per lookup. Compare bounded MGET batches with your current client behavior, including missing-key handling. Cap response sizes and keep origin time separate from store service time.",
        "一个页面需要多次串行查询时，每次查询可用的时间会减少。对照当前客户端行为验证有界 MGET 批次，包括缺失键处理。限制响应大小，并分别测量源站耗时与存储服务耗时。",
      ),
      decision(
        "Size keys as well as values",
        "同时规划键与值的容量",
        "Track key count, average key length, value-size percentiles, TTL distribution, memory reservations, and usable SSD headroom. Tiny objects can remain dominated by index and runtime memory; increasing the number of keys is not free.",
        "记录键数、平均键长、值大小分位数、TTL 分布、内存预留与 SSD 可用余量。小对象仍可能主要消耗索引和运行时内存；键数量增长并非没有成本。",
      ),
    ],
    trials: [
      trial(
        "Long-tail reads",
        "长尾读取",
        "Replay the same key trace at the retained dataset size; include low-locality and post-restart access.",
        "以计划保留的数据集大小回放同一键访问轨迹，包含低局部性和重启后的访问。",
        "Application p99/p99.9, timeout rate, and origin QPS stay within the agreed budgets.",
        "应用 p99/p99.9、超时率和回源 QPS 均满足既定预算。",
      ),
      trial(
        "Expiry and refill waves",
        "集中到期与回填",
        "Exercise your real TTL mix, invalidation bursts, and concurrent refill traffic.",
        "测试真实 TTL 分布、失效突发与并发回填流量。",
        "Hit rate recovers without saturating the origin or exhausting client retry budgets.",
        "命中率恢复时不会使源站饱和，也不会耗尽客户端重试预算。",
      ),
      trial(
        "Capacity at target load",
        "目标负载下的容量",
        "Measure resident memory, device occupancy, write traffic, and cost while growing retained objects.",
        "增加保留对象时，同时测量常驻内存、设备占用、写入流量与成本。",
        "Compare complete deployments at the same latency target and retained dataset, with recovery headroom.",
        "在相同延迟目标、相同保留数据集下比较完整部署，并预留恢复余量。",
      ),
    ],
    commands: ["SET", "GET", "MGET", "DEL"],
    related: ["ecommerce-marketplaces", "online-feature-serving"],
    bestFit: b(
      "Large, rebuildable values; an expensive miss path; and enough retained data for capacity economics to matter.",
      "可重建的大量值数据、昂贵的未命中路径，以及足以影响容量成本的保留规模。",
    ),
    boundary: b(
      "Lavik 0.1.0 is a beta. The published GET/SET tests do not establish your hit ratio, eviction policy, multi-region availability, or an application SLA. Verify the exact client and failure behavior before changing the production cache.",
      "Lavik 0.1.0 是 beta 版本。已发布的 GET/SET 测试不能证明你的命中率、淘汰策略、多地域可用性或应用 SLA。调整生产缓存前，应验证准确的客户端与故障行为。",
    ),
  },
  {
    slug: "online-feature-serving",
    group: "workload",
    title: b("Online feature serving", "在线特征服务"),
    navSummary: b(
      "Serve more entities and feature versions.",
      "服务更多实体与特征版本。",
    ),
    headline: b(
      "More features per entity.\nLess dependence on DRAM.",
      "每个实体拥有更多特征，\n减少对 DRAM 的依赖。",
    ),
    summary: b(
      "For recommendation and inference services reading precomputed feature values through Redis. Scale the serving payload across users, items, tenants, and model versions without assuming every feature must occupy memory.",
      "面向通过 Redis 读取预计算特征值的推荐与推理服务。让用户、商品、租户和模型版本的特征数据持续扩展，无需假设每个特征都必须驻留内存。",
    ),
    pressure: [
      b(
        "Feature capacity multiplies along several axes at once: entity count, feature width, freshness windows, and concurrently served model versions. The active population can shift faster than a small hot set can stabilize, particularly during launches or broad candidate retrieval.",
        "特征容量会沿多个维度同时增长：实体数量、特征宽度、新鲜度窗口，以及同时服务的模型版本。在新功能上线或大范围候选获取期间，活跃群体可能比小热集稳定下来的速度变化得更快。",
      ),
      b(
        "Moving less-used features to a storage tier saves memory, but one late lookup can hold up an inference request. Measure the distribution of complete feature-vector assembly time, including cold entities and missing features; a store-wide average is not the model's serving budget.",
        "将低频特征放入存储层可以节省内存，但一次迟到的查询就可能阻塞推理请求。应测量完整特征向量组装时间的分布，包括冷实体和缺失特征；存储整体平均耗时并不等于模型的服务预算。",
      ),
    ],
    fit: b(
      "Use Lavik as the online key-value serving layer for application-prepared features. NVMe SSD holds the value capacity, while the in-memory key index supports lookups. Keep feature computation, event-time correctness, schema management, and offline training datasets in their existing systems.",
      "将 Lavik 用作应用预先准备的特征的在线键值服务层。NVMe SSD 承载值容量，内存键索引支持查询。特征计算、事件时间正确性、模式管理与离线训练数据仍由现有系统负责。",
    ),
    valueDriver: b(
      "Entity cardinality × feature width × model versions",
      "实体基数 × 特征宽度 × 模型版本数",
    ),
    serving: b("Inference / recommendation service", "推理 / 推荐服务"),
    origin: b(
      "Feature pipeline + application materializer",
      "特征流水线 + 应用物化程序",
    ),
    equation: b(
      "Value payload ≈ entities × serialized feature bytes × simultaneously served versions",
      "值数据量 ≈ 实体数 × 序列化特征字节数 × 同时服务的版本数",
    ),
    decisions: [
      decision(
        "Make the serving contract versioned",
        "对服务契约进行版本管理",
        "Choose packed strings or hashes based on the operations your client actually uses. Include schema/model version and an as-of timestamp in the record. Define defaults for absent fields and a freshness cutoff independently of storage expiry.",
        "根据客户端实际执行的操作选择打包字符串或哈希。记录中包含模式/模型版本和数据时间戳。为缺失字段定义默认值，并独立于存储过期时间定义新鲜度截止条件。",
      ),
      decision(
        "Account for the entire lookup fan-out",
        "计算完整查询扇出",
        "Budget entity reads, feature decoding, joins, and inference separately. Benchmark bounded HMGET/MGET requests with the real feature width. Atomic writes to a record do not by themselves provide an event-time-consistent snapshot across all entities.",
        "分别预算实体读取、特征解码、关联与推理耗时。用真实特征宽度测试有界 HMGET/MGET 请求。对单条记录进行原子写入，并不会自动提供跨所有实体的事件时间一致快照。",
      ),
      decision(
        "Test your connector, not just its command names",
        "验证连接器，而不只是命令名称",
        "Map connector initialization, Lua calls, pipelines, field expiry, and serialization to the versioned command reference. The verified client examples are useful starting points; they do not certify Feast or another feature-store connector. Plan backfill throttling and reconciliation after lag.",
        "将连接器初始化、Lua 调用、流水线、字段过期和序列化映射到版本化命令参考。已验证的客户端示例可作为起点，但不代表已认证 Feast 或其他特征存储连接器。为回填限流和延迟后的对账做好计划。",
      ),
    ],
    trials: [
      trial(
        "Cold-entity inference",
        "冷实体推理",
        "Replay production entity distributions plus a uniform-access stress case at full feature width.",
        "回放生产实体分布，并以完整特征宽度增加均匀访问压力测试。",
        "Feature-assembly p99 fits its portion of the inference budget; missing/stale feature rates remain acceptable.",
        "特征组装 p99 满足推理链路分配的预算，缺失或过期特征比例可接受。",
      ),
      trial(
        "Backfill during serving",
        "在线服务期间回填",
        "Read while refreshing or backfilling a second model version; retain application timestamps.",
        "刷新或回填第二个模型版本时持续读取，并保留应用时间戳。",
        "Read deadlines and freshness objectives hold together; the publisher cannot overwrite a newer version with an older event.",
        "读取截止时间与新鲜度目标同时满足；发布程序不会用旧事件覆盖新版本。",
      ),
      trial(
        "Connector correctness",
        "连接器正确性",
        "Exercise actual connector calls, partial records, absent entities, reconnects, and deserialization failures.",
        "测试真实连接器调用、部分记录、缺失实体、重连与反序列化失败。",
        "Returned values and fallback decisions match the existing serving contract before routing inference traffic.",
        "在引入推理流量前，返回值与回退决策符合现有服务契约。",
      ),
    ],
    commands: ["HSET", "HMGET", "HGET", "EXPIRE"],
    related: ["adtech-personalization", "large-application-caches"],
    bestFit: b(
      "Precomputed, reconstructable feature values with substantial payload per entity and a clear materialization pipeline.",
      "可重建的预计算特征值，每个实体有相当的值数据量，并有明确的物化流水线。",
    ),
    boundary: b(
      "This is a key-value serving design, not a built-in feature platform, vector index, or point-in-time training join. A tiny high-contention counter is a different workload from the published 1 KiB GET/SET benchmark.",
      "这是键值服务设计，并非内置特征平台、向量索引或时间点正确的训练关联。高争用的小计数器与已发布的 1 KiB GET/SET 基准属于不同负载。",
    ),
  },
  {
    slug: "sessions-user-profiles",
    group: "workload",
    title: b("Sessions & user profiles", "会话与用户画像"),
    navSummary: b(
      "Retain more user context across devices.",
      "跨设备保留更多用户上下文。",
    ),
    headline: b(
      "Retain the context.\nReconsider the memory cost.",
      "保留用户上下文，\n重新规划内存成本。",
    ),
    summary: b(
      "For applications whose Redis session and profile payload grows with users, devices, tenants, and retention. Separate cheap-to-rebuild context from security-critical session authority, and size each path deliberately.",
      "适用于 Redis 会话与画像数据随用户、设备、租户和保留期增长的应用。区分易于重建的上下文与安全关键的会话权威状态，有针对性地规划每条路径。",
    ),
    pressure: [
      b(
        "Daily active users do not describe the retained dataset. Mobile devices reconnect, users keep multiple sessions, and profile documents accumulate preferences and application state. Extending retention can grow stored bytes without a corresponding increase in peak QPS.",
        "日活用户数不能代表保留数据集。移动设备会重连，用户会保留多个会话，画像文档不断积累偏好和应用状态。延长保留期可能显著增加存储字节数，却不会同比增加峰值 QPS。",
      ),
      b(
        "In-memory capacity makes this retained context expensive. With disk-backed alternatives, a reconnect storm can move cold profiles directly onto the critical request path. The relevant metric is the login or resume experience at the tail, including backend fallback and retries.",
        "全内存容量使这些保留上下文成本高昂。使用磁盘存储方案时，重连风暴会让冷画像直接进入关键请求路径。相关指标是登录或恢复体验的尾部延迟，包括后端回退与重试。",
      ),
    ],
    fit: b(
      "Lavik is a candidate for larger, reconstructable session context and user-profile values. Preserve application-managed TTL and deletion semantics and retain an authoritative identity/profile system. Use the NVMe SSD capacity advantage where payload retention drives the bill, then separately qualify availability and revocation behavior.",
      "Lavik 可用于评估较大且可重建的会话上下文与用户画像值。保留由应用管理的 TTL 和删除语义，并保留权威身份/画像系统。在值数据保留量主导账单的路径上利用 NVMe SSD 容量优势，再单独验证可用性与撤销行为。",
    ),
    valueDriver: b(
      "Retained context per user, device, and tenant",
      "每个用户、设备与租户保留的上下文",
    ),
    serving: b("Application session / profile service", "应用会话 / 画像服务"),
    origin: b(
      "Identity and profile systems + application refresh",
      "身份与画像系统 + 应用刷新逻辑",
    ),
    equation: b(
      "Value payload ≈ retained sessions × context bytes + retained profiles × profile bytes",
      "值数据量 ≈ 保留会话数 × 上下文字节数 + 保留画像数 × 画像字节数",
    ),
    decisions: [
      decision(
        "Separate context from authentication authority",
        "区分上下文与认证权威状态",
        "Decide which fields can be rebuilt or served stale and which must be rejected when unavailable. A missing cached preference can fall back to a profile service; a missing or stale revocation record must follow the authentication design's explicit failure policy.",
        "确定哪些字段可以重建或返回旧值，哪些在不可用时必须拒绝请求。缺失缓存偏好可以回退到画像服务；缺失或过期的撤销记录必须遵循认证设计中明确的故障策略。",
      ),
      decision(
        "Keep expiry and logout testable",
        "让过期与退出登录可验证",
        "Distinguish absolute expiry from sliding inactivity expiry. Exercise the exact SET options used for refresh, explicit DEL on logout, and concurrent device updates. Storage-level TTL alone does not implement your full session lifecycle.",
        "区分绝对到期与滑动空闲到期。测试刷新使用的准确 SET 选项、退出登录时的显式 DEL，以及多设备并发更新。存储级 TTL 本身不能实现完整会话生命周期。",
      ),
      decision(
        "Avoid turning profiles into hot locks",
        "避免将画像变成热点锁",
        "Bound record size and update granularity; isolate tenant and schema identifiers in keys. Keep large context updates from sharing a single contended key with tiny critical counters. Measure index memory when the dataset contains many short-lived, small sessions.",
        "限制记录大小与更新粒度，在键中区分租户和模式标识。避免大上下文更新与小型关键计数器争用同一个热点键。若数据集包含大量短生命周期小会话，应实际测量索引内存。",
      ),
    ],
    trials: [
      trial(
        "Resume storms",
        "集中恢复连接",
        "Replay returning-user access after idle periods, deployment restarts, and regional traffic shifts.",
        "回放空闲后、部署重启后及地域流量切换后的回访用户请求。",
        "Login/resume p99 and timeout rates meet the application target without overloading the authority service.",
        "登录/恢复 p99 与超时率满足应用目标，且不会压垮权威服务。",
      ),
      trial(
        "Expiry and revocation races",
        "过期与撤销竞争",
        "Test expiry, refresh, logout, and concurrent reads using the real session library.",
        "使用真实会话库测试过期、刷新、退出与并发读取。",
        "No request is authorized by stale or missing state contrary to the defined authentication policy.",
        "不会因过期或缺失状态而违背既定认证策略错误授权请求。",
      ),
      trial(
        "Failure and reconstruction",
        "故障与重建",
        "Exercise timeouts, connection loss, restart, and restoration from the authoritative source.",
        "测试超时、连接丢失、重启与从权威数据源恢复。",
        "Recovery and fail-closed/fallback behavior are explicitly accepted before storing authoritative sessions.",
        "在存储权威会话前，明确验收恢复流程以及拒绝/回退行为。",
      ),
    ],
    commands: ["SET", "GET", "TTL", "DEL"],
    related: ["gaming-live-services", "large-application-caches"],
    bestFit: b(
      "Substantial retained user-context payload with an existing authoritative source and a bounded reconstruction path.",
      "有相当规模的保留用户上下文值数据，且具备现有权威源与有界重建路径。",
    ),
    boundary: b(
      "The local TTL/delete example is not a security, replication, or failover certification. Small tokens with little value payload may offer much less capacity saving than larger profile records.",
      "本地 TTL/删除示例不构成安全、复制或故障转移认证。值数据很少的小令牌，其容量节约可能远低于较大的画像记录。",
    ),
  },
  {
    slug: "real-time-leaderboards",
    group: "workload",
    title: b("Real-time leaderboards", "实时排行榜"),
    navSummary: b(
      "Scale seasons, cohorts, and ranked state.",
      "扩展赛季、分组与排名状态。",
    ),
    headline: b(
      "More seasons. More cohorts.\nA different capacity equation.",
      "更多赛季，更多分组，\n重新计算容量成本。",
    ),
    summary: b(
      "For Redis sorted-set workloads accumulating ranked members across games, communities, tenants, and time windows. Evaluate Lavik's sorted-set operations with the real board geometry and update contention.",
      "面向 Redis 有序集合负载：排名成员随游戏、社区、租户和时间窗口积累。用真实榜单规模与更新争用评估 Lavik 的有序集合操作。",
    ),
    pressure: [
      b(
        "A single top-100 widget can conceal millions of retained members and thousands of concurrent boards. Keeping previous seasons and regional cohorts online multiplies state even when only a small result window is displayed.",
        "一个前 100 名组件背后，可能保留着数百万成员与数千个并行榜单。即使展示窗口很小，在线保留历史赛季与地域分组也会使状态成倍增长。",
      ),
      b(
        "Moving that state to disk changes the economics, but point-read QPS says little about rank updates, range retrieval, or a heavily contended board. Tail latency must be measured during score bursts and retention cleanup, not only with an idle dataset.",
        "将这些状态移到磁盘会改变成本结构，但点查询 QPS 无法充分说明排名更新、范围读取或高争用榜单的表现。必须在分数突发写入和保留清理期间测量尾延迟，而不只是测试空闲数据集。",
      ),
    ],
    fit: b(
      "Lavik exposes tested sorted-set command examples through the Redis protocol and stores data through its storage engine. Treat many independent, moderately sized boards as an initial evaluation shape. Measure the complete memory footprint; the string-value benchmark does not quantify sorted-set bytes per member or rank-update throughput.",
      "Lavik 通过 Redis 协议提供经过示例测试的有序集合命令，并通过其存储引擎存储数据。初始评估可选择多个独立且规模适中的榜单。应测量完整内存占用；字符串值基准并不能说明每个有序集合成员的字节开销或排名更新吞吐量。",
    ),
    valueDriver: b(
      "Members × boards × retained seasons",
      "成员数 × 榜单数 × 保留赛季数",
    ),
    serving: b("Ranking / leaderboard API", "排名 / 排行榜 API"),
    origin: b(
      "Score event log + application replay worker",
      "得分事件日志 + 应用回放任务",
    ),
    equation: b(
      "Retained members ≈ members per board × cohorts × seasons; measure bytes per member",
      "保留成员数 ≈ 每榜成员数 × 分组数 × 赛季数；每成员字节数需实测",
    ),
    decisions: [
      decision(
        "Partition by product meaning",
        "按业务含义划分榜单",
        "Use season, game, region, or cohort boundaries where the ranking contract permits them. A single hot sorted-set key remains a contention target; adding workers does not automatically distribute one board. Global ranking across separate boards needs application logic.",
        "在排名契约允许的情况下，以赛季、游戏、地域或分组划分边界。单个热点有序集合键仍然存在争用；增加工作线程不会自动拆分一个榜单。跨多个榜单的全局排名需要应用逻辑实现。",
      ),
      decision(
        "Define score and retry semantics",
        "定义分数与重试语义",
        "Choose between absolute ZADD scores and incremental ZINCRBY updates. Retrying an increment can apply it twice unless the application provides deduplication. Preserve tie ordering, rank direction, and the treatment of disconnected players.",
        "在 ZADD 绝对分数与 ZINCRBY 增量更新之间做出选择。除非应用提供去重，重试一次增量操作可能导致重复加分。保持并列分数排序、排名方向以及离线玩家处理规则一致。",
      ),
      decision(
        "Bound ranges and retention work",
        "限制范围查询与保留清理工作量",
        "Page through bounded ranking windows. Decide whether seasons expire as complete keys or require explicit member pruning, and measure cleanup alongside writes. Keep a replayable score source if ranked state must be reconstructed.",
        "分页读取有界排名窗口。决定赛季是整键到期，还是需要显式删除成员，并在写入同时测量清理开销。若排名状态需要重建，应保留可回放的得分源。",
      ),
    ],
    trials: [
      trial(
        "Score bursts on hot boards",
        "热点榜单的分数突发",
        "Use real board-size distributions and concentration of updates during live events.",
        "采用真实榜单规模分布与直播活动期间的更新集中度。",
        "Score-update and top-N p99/p99.9 fit the product deadlines with bounded client queues.",
        "分数更新与 top-N 查询的 p99/p99.9 满足产品截止时间，客户端队列保持有界。",
      ),
      trial(
        "Rank and replay correctness",
        "排名与回放正确性",
        "Compare ties, rank direction, pagination, duplicate events, and restart reconstruction.",
        "对比并列分数、排名方向、分页、重复事件与重启重建。",
        "Ranks match the existing contract and replay does not double-apply score changes.",
        "排名符合现有契约，回放不会重复应用分数变化。",
      ),
      trial(
        "Season rollover",
        "赛季切换",
        "Retain old boards while creating new cohorts and expiring or pruning old state.",
        "保留旧榜单的同时创建新分组，并对旧状态执行过期或裁剪。",
        "Usable capacity and memory stay within budget without disrupting live board latency.",
        "可用容量与内存保持在预算内，同时不破坏在线榜单延迟。",
      ),
    ],
    commands: ["ZADD", "ZINCRBY", "ZREVRANGE", "ZREVRANK", "EXPIRE"],
    related: ["gaming-live-services", "sessions-user-profiles"],
    bestFit: b(
      "A growing portfolio of retained boards with clear cohort boundaries and replayable source events.",
      "持续增长的保留榜单集合，具备明确分组边界和可回放源事件。",
    ),
    boundary: b(
      "The verified example proves a small command sequence, not million-member performance, tournament correctness, or queue/framework compatibility. Calculate sorted-set capacity from measurements instead of applying the 1 KiB string benchmark directly.",
      "已验证示例只证明一个小型命令序列，并不证明百万成员性能、赛事正确性或队列/框架兼容性。应根据实测计算有序集合容量，而不是直接套用 1 KiB 字符串基准。",
    ),
  },
  {
    slug: "ecommerce-marketplaces",
    group: "industry",
    title: b("E-commerce & marketplaces", "电商与交易平台"),
    navSummary: b(
      "Catalog breadth without a memory-capacity tax.",
      "扩展商品覆盖，降低内存容量负担。",
    ),
    headline: b(
      "Keep the catalog close.\nKeep capacity costs down.",
      "让完整商品目录触手可及，\n降低容量成本。",
    ),
    summary: b(
      "For commerce teams serving Redis-backed product, offer, and merchandising read models. Catalog growth, seller count, locale, and price-list versions expand the dataset long before peak traffic requires more compute.",
      "面向通过 Redis 服务商品、报价与展示读取模型的电商团队。商品、卖家、语言地区和价格表版本会使数据集持续扩张，而峰值流量未必需要同比增加计算资源。",
    ),
    pressure: [
      b(
        "A SKU is rarely one cached record. Markets, sellers, currencies, fulfillment regions, experiments, and content variants create many serving representations. Evicting the long tail saves DRAM by moving latency and database load onto the first shopper who needs it.",
        "一个 SKU 往往不止对应一条缓存记录。市场、卖家、币种、履约地域、实验与内容变体都会产生多种服务表示。淘汰长尾能够节省 DRAM，却会把延迟和数据库负载转移给第一个需要它的消费者。",
      ),
      b(
        "SSD-backed reads must still fit product-page and browse deadlines during a promotion. A disk tier that looks acceptable at average traffic can expose latency when shoppers suddenly spread across a wider catalog and refresh writes compete for I/O.",
        "促销期间，SSD 读取仍须满足商品页与浏览链路的截止时间。当消费者突然访问更广的商品范围，且刷新写入争用 I/O 时，平常流量下看似可接受的磁盘层可能暴露出延迟问题。",
      ),
    ],
    fit: b(
      "Place application-prepared catalog and offer snapshots in Lavik, with authoritative data and refresh logic kept in the commerce platform. NVMe SSD capacity makes a broader retained read model worth evaluating. The benefit should appear as lower serving-capacity cost at the required latency and freshness, with fewer expensive origin lookups.",
      "将应用准备好的商品与报价快照存入 Lavik，权威数据和刷新逻辑仍保留在电商平台中。NVMe SSD 容量使保留更广泛的读取模型值得评估。价值应体现为在所需延迟和新鲜度下更低的服务容量成本，以及更少的昂贵回源查询。",
    ),
    valueDriver: b(
      "Catalog breadth, seller offers, locales, and snapshot versions",
      "商品覆盖、卖家报价、地区语言与快照版本",
    ),
    serving: b("Browse / product-page service", "浏览 / 商品详情页服务"),
    origin: b(
      "Catalog and pricing databases + application CDC consumers",
      "商品与定价数据库 + 应用 CDC 消费程序",
    ),
    equation: b(
      "Value payload ≈ SKUs × serving variants × average snapshot bytes × retained versions",
      "值数据量 ≈ SKU 数 × 服务变体数 × 平均快照字节数 × 保留版本数",
    ),
    decisions: [
      decision(
        "Keep the purchasing authority clear",
        "明确购买流程的权威边界",
        "Use cached price and availability as serving snapshots with explicit versions and freshness rules. Checkout must perform the platform's authoritative price, inventory, and reservation checks. A fast key-value lookup does not implement stock reservation or a payment ledger.",
        "缓存价格和可用性应是具有明确版本与新鲜度规则的服务快照。结账仍须执行平台的权威价格、库存与预留检查。快速键值查询并不能实现库存预留或支付账本。",
      ),
      decision(
        "Make key geometry follow the storefront",
        "让键结构对应实际店面",
        "Include tenant/seller, market, locale, and snapshot version where they change the response. Bound MGET fan-out for a product grid. Store prepared representations when that reduces expensive joins, while measuring duplicated payload against the saved request work.",
        "对于会改变响应的维度，在键中包含租户/卖家、市场、语言地区与快照版本。限制商品列表的 MGET 扇出。如果预先准备表示可以减少昂贵关联，应同时比较重复值数据的成本与节省的请求工作。",
      ),
      decision(
        "Make refresh idempotent",
        "让刷新过程具备幂等性",
        "Handle duplicate and out-of-order events in the CDC consumer. Use application versions or reconciliations to prevent stale materialization, and spread expirations to avoid synchronized refill. Lavik does not supply an automatic commerce CDC connector.",
        "在 CDC 消费程序中处理重复和乱序事件。通过应用版本或对账防止旧数据物化，并分散过期以避免同步回填。Lavik 不提供自动电商 CDC 连接器。",
      ),
    ],
    trials: [
      trial(
        "Promotion traffic",
        "促销流量",
        "Replay hot-item spikes and broad catalog discovery while refreshing offers.",
        "在刷新报价的同时回放热门商品突发和广泛商品浏览。",
        "Browse/product-page tail latency and origin traffic satisfy the event plan.",
        "浏览/商品页尾延迟与源站流量满足活动计划。",
      ),
      trial(
        "Freshness under update lag",
        "更新延迟下的新鲜度",
        "Inject duplicate, delayed, and reordered catalog/price events into your consumer.",
        "向消费程序注入重复、延迟和乱序的商品/价格事件。",
        "Visible versions do not regress, and stale snapshots follow the storefront's explicit policy.",
        "可见版本不会回退，过期快照按店面既定策略处理。",
      ),
      trial(
        "Multi-market capacity",
        "多市场容量",
        "Load realistic seller, market, locale, and version combinations; measure payload duplication.",
        "载入真实卖家、市场、语言地区与版本组合，测量值数据重复量。",
        "Compare complete serving cost at equal catalog coverage, freshness, and latency targets.",
        "在商品覆盖、新鲜度和延迟目标相同的条件下比较完整服务成本。",
      ),
    ],
    commands: ["SET", "MGET", "DEL"],
    related: ["large-application-caches", "online-feature-serving"],
    bestFit: b(
      "Large, rebuildable commerce read models where catalog coverage and variant count drive memory spend.",
      "商品覆盖与变体数量主导内存支出的、大型且可重建的电商读取模型。",
    ),
    boundary: b(
      "This design does not replace search, transactional inventory, or payment systems. Category and industry examples are reference architectures for evaluation, not customer deployments.",
      "该设计不替代搜索、事务库存或支付系统。这些场景与行业示例是供评估的参考架构，不是客户部署案例。",
    ),
  },
  {
    slug: "adtech-personalization",
    group: "industry",
    title: b("Adtech & personalization", "广告技术与个性化"),
    navSummary: b(
      "Broader decision context within a latency budget.",
      "在延迟预算内获取更广泛的决策上下文。",
    ),
    headline: b(
      "Retain more decision context.\nProtect the request deadline.",
      "保留更多决策上下文，\n守住请求截止时间。",
    ),
    summary: b(
      "For Redis-based audience, campaign, and enrichment lookups. Expand retained context on NVMe SSD while testing the latency of complete decision requests under broad key access and update churn.",
      "面向基于 Redis 的受众、活动与信息补全查询。在 NVMe SSD 上扩展保留上下文，同时在广泛键访问与频繁更新下测试完整决策请求的延迟。",
    ),
    pressure: [
      b(
        "Audience profiles, segment snapshots, creative metadata, and campaign variants grow with reachable users and retention, not just impressions per second. A small memory hot set may not capture the next burst of identities or an expanded campaign audience.",
        "受众画像、分组快照、创意元数据和活动变体随可触达用户与保留期增长，并不只取决于每秒展示数。小内存热集可能无法覆盖下一波身份请求或扩展后的活动受众。",
      ),
      b(
        "The deadline is unforgiving: a context read that arrives after the decision is useless even if it succeeds. SSD capacity is valuable only when the qualifying workload delivers enough useful responses on time. Record late responses and fallback decisions, not just server QPS.",
        "截止时间不会等待：即使上下文查询最终成功，在决策之后到达也没有价值。只有当经验证的负载能按时提供足够有效响应时，SSD 容量才有意义。除了服务端 QPS，还要记录迟到响应与回退决策。",
      ),
    ],
    fit: b(
      "Evaluate Lavik for capacity-heavy profile and campaign read models accessed through known Redis commands. Its published one-billion-key random-read sweep provides concrete starting points for latency-constrained testing. Keep each serving deadline explicit and choose a lower-load operating point with headroom rather than adopting a peak-throughput number as an SLO.",
      "对于通过已知 Redis 命令访问且容量较大的画像与活动读取模型，可评估 Lavik。其已发布的十亿键随机读取扫描为受延迟约束的测试提供了具体起点。明确每条服务链路的截止时间，选择具有余量的较低负载运行点，而不是把峰值吞吐量当作 SLO。",
    ),
    valueDriver: b(
      "Reachable identities × context width × retention",
      "可触达身份数 × 上下文宽度 × 保留期",
    ),
    serving: b("Decision / personalization service", "决策 / 个性化服务"),
    origin: b(
      "Audience and campaign pipelines + application publishers",
      "受众与活动流水线 + 应用发布程序",
    ),
    equation: b(
      "Value payload ≈ retained identities × profile bytes + campaign/context snapshots",
      "值数据量 ≈ 保留身份数 × 画像字节数 + 活动/上下文快照",
    ),
    decisions: [
      decision(
        "Budget the decision, not one GET",
        "预算完整决策，而不只是一次 GET",
        "Subtract network, fan-out, decoding, model/scoring, and downstream time from the total deadline. Use bounded batches where their semantics fit. Define what a missing or late profile means before load testing; do not hide deadline misses inside client retries.",
        "从总截止时间中扣除网络、扇出、解码、模型/评分与下游耗时。在语义合适的情况下使用有界批次。负载测试前定义画像缺失或迟到的处理方式，不要让客户端重试掩盖截止时间违约。",
      ),
      decision(
        "Separate payload serving from contended counters",
        "区分值数据服务与高争用计数器",
        "Profile lookups and per-event budget/frequency updates have different contention and correctness needs. The GET/SET benchmark does not establish exactly-once increments, cross-key budget enforcement, or an auction framework's compatibility. Qualify those paths independently.",
        "画像查询与逐事件预算/频次更新在争用和正确性方面有不同需求。GET/SET 基准不能证明恰好一次增量、跨键预算约束或拍卖框架兼容性。应分别验证这些路径。",
      ),
      decision(
        "Propagate change and deletion deliberately",
        "有计划地传播变更与删除",
        "Version audience and campaign records in application publishers, bound freshness, and test explicit invalidation across serving copies. Cache TTL is a retention tool; it does not by itself implement your application's consent, suppression, or deletion workflow.",
        "在应用发布程序中对受众和活动记录进行版本管理，限制数据陈旧时间，并测试所有服务副本的显式失效。缓存 TTL 是保留工具，本身并不能实现应用的同意、屏蔽或删除工作流。",
      ),
    ],
    trials: [
      trial(
        "Deadline-constrained lookup load",
        "受截止时间约束的查询负载",
        "Use an arrival-rate-controlled generator and the real fan-out, payload sizes, and cold-key fraction.",
        "使用控制请求到达率的发生器，采用真实扇出、值大小与冷键比例。",
        "Useful responses before the deadline meet the target; queues and retry traffic remain bounded.",
        "截止时间前的有效响应达到目标，队列与重试流量保持有界。",
      ),
      trial(
        "Audience expansion and churn",
        "受众扩展与更替",
        "Grow the keyspace and rotate active cohorts while publishers update records.",
        "发布程序更新记录时，增加键空间并切换活跃群体。",
        "Decision p99/p99.9, fallback rate, and freshness remain acceptable across transitions.",
        "群体切换期间，决策 p99/p99.9、回退率与新鲜度保持可接受。",
      ),
      trial(
        "Counter and invalidation correctness",
        "计数器与失效正确性",
        "Test the exact update scripts, retries, duplicates, and deletion propagation used by the application.",
        "测试应用实际使用的更新脚本、重试、重复请求与删除传播。",
        "Business invariants hold independently of the successful profile-read benchmark.",
        "业务不变量得到满足，不以画像读取基准成功替代验证。",
      ),
    ],
    commands: ["SET", "MGET", "DEL"],
    related: ["online-feature-serving", "large-application-caches"],
    bestFit: b(
      "High-cardinality, reconstructable enrichment payload with measured per-request latency headroom.",
      "高基数、可重建的信息补全值数据，且每请求延迟余量经过实测。",
    ),
    boundary: b(
      "A hard microsecond-scale or sub-millisecond end-to-end deadline is not established by the peak benchmark. Use the full connection sweep, test your arrival process, and reject the migration if its deadline budget cannot be met.",
      "峰值基准不能证明严格的微秒级或端到端亚毫秒截止时间。应使用完整连接数扫描并测试实际到达过程；如果无法满足截止时间预算，应拒绝该迁移方案。",
    ),
  },
  {
    slug: "gaming-live-services",
    group: "industry",
    title: b("Gaming & live services", "游戏与在线服务"),
    navSummary: b(
      "Keep player state and past seasons accessible.",
      "持续提供玩家状态与历史赛季访问。",
    ),
    headline: b(
      "More players. More retained state.\nLess capacity tied to DRAM.",
      "更多玩家，更多保留状态，\n减少容量对 DRAM 的依赖。",
    ),
    summary: b(
      "For teams using Redis to serve player profiles, social context, and ranked read models. Retain returning-player and seasonal data economically while measuring reconnect bursts and live-event tail latency.",
      "面向使用 Redis 服务玩家画像、社交上下文和排名读取模型的团队。经济地保留回归玩家与赛季数据，同时测量集中重连与在线活动的尾延迟。",
    ),
    pressure: [
      b(
        "Concurrent players determine traffic, but registered players, regions, game modes, and retained seasons determine capacity. Dropping inactive players from memory reduces cost by making the next return or event-driven reactivation more expensive.",
        "同时在线玩家决定流量，而注册玩家、地域、游戏模式与保留赛季决定容量。将不活跃玩家从内存中移除能够降低成本，却会提高下次回归或活动触发重新活跃时的访问代价。",
      ),
      b(
        "A disk-backed serving layer needs to handle those returning players while active sessions continue. Measure bursts of profile hydration, writes from progression events, and ranking reads together; smooth average traffic understates a launch or season reset.",
        "磁盘服务层需要在活跃会话持续运行时处理回归玩家。应一起测量画像加载突发、进度事件写入与排名读取；平滑平均流量低估了上线或赛季重置时的压力。",
      ),
    ],
    fit: b(
      "Use Lavik for application-prepared player context and independently qualified ranking state where retained payload drives Redis capacity. Preserve the authoritative game-state or event system and a replay/rebuild path. Separate low-latency simulation and critical account balances from the read-model evaluation.",
      "当保留值数据主导 Redis 容量时，可使用 Lavik 评估应用准备的玩家上下文与单独验证的排名状态。保留权威游戏状态或事件系统，以及回放/重建路径。低延迟模拟与关键账户余额应与读取模型评估分开。",
    ),
    valueDriver: b(
      "Registered players, game modes, regions, and retained seasons",
      "注册玩家、游戏模式、地域与保留赛季",
    ),
    serving: b(
      "Player services / social and ranking APIs",
      "玩家服务 / 社交与排名 API",
    ),
    origin: b(
      "Game-state database or event log + application projections",
      "游戏状态数据库或事件日志 + 应用投影程序",
    ),
    equation: b(
      "Value payload ≈ retained players × context bytes × game/region variants; size ranked members separately",
      "值数据量 ≈ 保留玩家数 × 上下文字节数 × 游戏/地域变体数；排名成员另行规划",
    ),
    decisions: [
      decision(
        "Separate serving context from authoritative progression",
        "区分服务上下文与权威进度",
        "Cache or materialize profiles with explicit source versions. Keep entitlement, inventory, and balance invariants in their authoritative workflow until equivalent failure semantics are demonstrated. A read-model rebuild must not re-award rewards or double-apply events.",
        "缓存或物化画像时附带明确的源版本。除非已证明等价故障语义，权益、库存与余额不变量仍由权威工作流负责。读取模型重建不能重复发放奖励或重复应用事件。",
      ),
      decision(
        "Partition the audience deliberately",
        "有计划地划分玩家群体",
        "Include game, region, and season in the key design when they change semantics. Bound profile/document size and ranking windows. Measure small hot cohorts separately from broad returning-player reads; one global board can behave very differently from many regional boards.",
        "当游戏、地域和赛季改变语义时，将其纳入键设计。限制画像/文档大小与排名窗口。分别测量小型热门群体和广泛回归玩家的读取；一个全局榜单可能与多个地域榜单表现完全不同。",
      ),
      decision(
        "Design the return and rollover paths",
        "设计回归与赛季切换路径",
        "Throttle reconstruction after a restart or event launch. Define old-season retention, expiry, and replay order. Verify the actual session and sorted-set command sequences rather than inferring framework compatibility from RESP support.",
        "在重启或活动上线后的重建中实施限流。定义旧赛季保留、过期与回放顺序。应验证实际会话与有序集合命令序列，不要从 RESP 支持推断框架兼容性。",
      ),
    ],
    trials: [
      trial(
        "Event and reconnect bursts",
        "活动与重连突发",
        "Replay returning-player loads alongside ongoing progression writes and social/profile reads.",
        "在持续进度写入与社交/画像读取同时回放回归玩家负载。",
        "Player-facing tail latency and timeout rates meet the launch budget with controlled origin traffic.",
        "玩家可见尾延迟与超时率满足上线预算，且源站流量可控。",
      ),
      trial(
        "Season transition",
        "赛季转换",
        "Keep prior seasons accessible while new cohorts populate and old data expires.",
        "在新群体写入和旧数据到期时，保持历史赛季可访问。",
        "Rollover fits memory/SSD headroom and does not degrade current-season read/write deadlines.",
        "赛季切换不超出内存/SSD 余量，且不会破坏当前赛季读写截止时间。",
      ),
      trial(
        "Projection rebuild",
        "投影重建",
        "Inject duplicate and reordered events and rebuild the serving state after interruption.",
        "注入重复和乱序事件，并在中断后重建服务状态。",
        "Profiles and ranks agree with authoritative state; rewards and increments are not applied twice.",
        "画像与排名和权威状态一致，奖励与增量不会重复应用。",
      ),
    ],
    commands: ["HSET", "HMGET", "EXPIRE", "DEL"],
    related: ["real-time-leaderboards", "sessions-user-profiles"],
    bestFit: b(
      "Growing retained player context with a durable authoritative source and clear regional or seasonal boundaries.",
      "持续增长的保留玩家上下文，具备持久权威源与明确地域或赛季边界。",
    ),
    boundary: b(
      "These are proposed serving architectures, not claims of game-engine, matchmaking, anti-cheat, or commercial customer validation. Qualify clustering, recovery, and the actual command mix before production adoption.",
      "这些是建议的服务架构，不代表已验证游戏引擎、匹配系统、反作弊或商业客户。生产采用前，应验证集群、恢复与实际命令组合。",
    ),
  },
]);

export type UseCase = z.infer<typeof useCaseSchema>;
