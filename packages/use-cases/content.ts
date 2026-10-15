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
    title: {
      en: "Large application caches",
      "zh-CN": "大容量应用缓存",
    },
    navSummary: {
      en: "Keep the long tail without a DRAM-sized bill.",
      "zh-CN": "保留长尾数据，降低内存容量成本。",
    },
    headline: {
      en: "Grow your cache.\nControl the memory bill.",
      "zh-CN": "缓存持续增长，\n容量成本保持可控。",
    },
    summary: {
      en: "Keep more product pages, API responses and reusable results close to the application. Lavik puts cached values on NVMe SSD, with Redis-compatible reads, writes and expiration—so cache coverage can grow without a matching DRAM bill.",
      "zh-CN":
        "让更多商品页面、API 响应与可复用结果随时可用。Lavik 将缓存值存于 NVMe SSD，提供 Redis 兼容的读写与过期操作，让缓存覆盖范围增长不再要求同比增加 DRAM 支出。",
    },
    pressure: [
      {
        en: "The expensive part of a mature cache is often its long tail: product variants, rendered fragments, tenant-specific responses, and objects that are read infrequently but costly to reconstruct. Shortening TTLs or evicting more aggressively frees memory by sending work back to the origin.",
        "zh-CN":
          "成熟缓存中昂贵的部分往往是长尾：商品变体、渲染片段、租户专属响应，以及读取不频繁但重建昂贵的对象。缩短 TTL 或加大淘汰力度能够释放内存，却会把压力转移回源站。",
      },
      {
        en: "An SSD-backed cache only solves that problem if disk-resident reads still fit the application budget. A warm-cache average hides broad key access, cache churn, and the origin traffic that follows timeouts. Compare useful responses delivered before the deadline, rather than stored bytes alone.",
        "zh-CN":
          "采用 SSD 的缓存只有在磁盘驻留数据的读取仍满足应用预算时，才真正解决问题。热缓存的平均值会掩盖广泛的键访问、缓存更替，以及超时带来的回源流量。应比较截止时间前返回的有效响应，而不仅是存下了多少数据。",
      },
    ],
    fit: {
      en: "Use Lavik as the cache between your application and its origin database or object store. Keep existing cache-aside and invalidation patterns, and move retained values onto NVMe SSD. A larger retained working set gives expensive-to-rebuild objects more room; track hit rate and origin traffic to put a value on that additional coverage.",
      "zh-CN":
        "将 Lavik 放在应用与源数据库或对象存储之间。沿用旁路缓存与失效处理模式，把保留值移到 NVMe SSD。更大的缓存为重建代价高的对象留出空间；通过命中率与回源流量衡量扩大覆盖范围的价值。",
    },
    valueDriver: {
      en: "Retained object payload and expensive origin misses",
      "zh-CN": "保留的对象值数据与昂贵的回源未命中",
    },
    serving: {
      en: "API / page-serving service",
      "zh-CN": "API / 页面服务",
    },
    origin: {
      en: "Database or object store + application refresh workers",
      "zh-CN": "数据库或对象存储 + 应用刷新任务",
    },
    equation: {
      en: "Value payload ≈ retained objects × average serialized bytes × live cache versions",
      "zh-CN":
        "值数据量 ≈ 保留对象数 × 平均序列化字节数 × 同时保留的缓存版本数",
    },
    decisions: [
      {
        title: {
          en: "Keep cache semantics explicit",
          "zh-CN": "明确缓存语义",
        },
        body: {
          en: "Define cache-aside reads, expiry, invalidation, and the stale-value policy in the application. Use versioned keys when a schema or rendering revision changes. Coalesce concurrent misses and bound origin retries so a flush or expiry wave cannot amplify an outage.",
          "zh-CN":
            "在应用中定义旁路缓存读取、过期、失效处理和旧值策略。模式或渲染版本变化时使用带版本的键。合并并发未命中并限制回源重试，避免清空或集中到期放大故障。",
        },
      },
      {
        title: {
          en: "Budget fan-out and response size",
          "zh-CN": "为扇出与响应大小预留预算",
        },
        body: {
          en: "A page that performs multiple serial lookups has less time available per lookup. Compare bounded MGET batches with your current client behavior, including missing-key handling. Cap response sizes and keep origin time separate from store service time.",
          "zh-CN":
            "一个页面需要多次串行查询时，每次查询可用的时间会减少。对照当前客户端行为验证有界 MGET 批次，包括缺失键处理。限制响应大小，并分别测量源站耗时与存储服务耗时。",
        },
      },
      {
        title: {
          en: "Size keys as well as values",
          "zh-CN": "同时规划键与值的容量",
        },
        body: {
          en: "Track key count, average key length, value-size percentiles, TTL distribution, memory reservations, and usable SSD headroom. Tiny objects can remain dominated by index and runtime memory; increasing the number of keys is not free.",
          "zh-CN":
            "记录键数、平均键长、值大小分位数、TTL 分布、内存预留与 SSD 可用余量。小对象仍可能主要消耗索引和运行时内存；键数量增长并非没有成本。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Long-tail reads",
          "zh-CN": "长尾读取",
        },
        measure: {
          en: "Replay the same key trace at the retained dataset size; include low-locality and post-restart access.",
          "zh-CN":
            "以计划保留的数据集大小回放同一键访问轨迹，包含低局部性和重启后的访问。",
        },
        accept: {
          en: "Application p99/p99.9, timeout rate, and origin QPS stay within the agreed budgets.",
          "zh-CN": "应用 p99/p99.9、超时率和回源 QPS 均满足既定预算。",
        },
      },
      {
        title: {
          en: "Expiry and refill waves",
          "zh-CN": "集中到期与回填",
        },
        measure: {
          en: "Exercise your real TTL mix, invalidation bursts, and concurrent refill traffic.",
          "zh-CN": "测试真实 TTL 分布、失效突发与并发回填流量。",
        },
        accept: {
          en: "Hit rate recovers without saturating the origin or exhausting client retry budgets.",
          "zh-CN": "命中率恢复时不会使源站饱和，也不会耗尽客户端重试预算。",
        },
      },
      {
        title: {
          en: "Capacity at target load",
          "zh-CN": "目标负载下的容量",
        },
        measure: {
          en: "Measure resident memory, device occupancy, write traffic, and cost while growing retained objects.",
          "zh-CN":
            "增加保留对象时，同时测量常驻内存、设备占用、写入流量与成本。",
        },
        accept: {
          en: "Compare complete deployments at the same latency target and retained dataset, with recovery headroom.",
          "zh-CN":
            "在相同延迟目标、相同保留数据集下比较完整部署，并预留恢复余量。",
        },
      },
    ],
    commands: ["SET", "GET", "MGET", "DEL"],
    related: ["ecommerce-marketplaces", "online-feature-serving"],
    bestFit: {
      en: "Large, rebuildable values; an expensive miss path; and enough retained data for capacity economics to matter.",
      "zh-CN":
        "可重建的大量值数据、昂贵的未命中路径，以及足以影响容量成本的保留规模。",
    },
    boundary: {
      en: "Roll out one cache namespace first. Compare hit rate, origin requests and application p99 at the same TTLs, then extend retention with the capacity you have freed up.",
      "zh-CN":
        "先迁移一个缓存命名空间。在相同 TTL 下比较命中率、回源请求与应用 p99，再利用新增容量延长保留时间。",
    },
  },
  {
    slug: "online-feature-serving",
    group: "workload",
    title: {
      en: "Online feature serving",
      "zh-CN": "在线特征服务",
    },
    navSummary: {
      en: "Serve more entities and feature versions.",
      "zh-CN": "服务更多实体与特征版本。",
    },
    headline: {
      en: "More features per entity.\nLess dependence on DRAM.",
      "zh-CN": "每个实体拥有更多特征，\n减少对 DRAM 的依赖。",
    },
    summary: {
      en: "Serve more features for more users, items and agents. Lavik brings NVMe SSD capacity to Redis-style feature lookups, with hashes for entity records and bounded multi-key reads for the request path.",
      "zh-CN":
        "为更多用户、商品与智能体提供更丰富的特征。Lavik 为 Redis 风格的特征查询提供 NVMe SSD 容量，用 Hash 保存实体记录，用有界多键读取服务在线请求。",
    },
    pressure: [
      {
        en: "Feature capacity multiplies along several axes at once: entity count, feature width, freshness windows, and concurrently served model versions. The active population can shift faster than a small hot set can stabilize, particularly during launches or broad candidate retrieval.",
        "zh-CN":
          "特征容量会沿多个维度同时增长：实体数量、特征宽度、新鲜度窗口，以及同时服务的模型版本。在新功能上线或大范围候选获取期间，活跃群体可能比小热集稳定下来的速度变化得更快。",
      },
      {
        en: "Moving less-used features to a storage tier saves memory, but one late lookup can hold up an inference request. Measure the distribution of complete feature-vector assembly time, including cold entities and missing features; a store-wide average is not the model's serving budget.",
        "zh-CN":
          "将低频特征放入存储层可以节省内存，但一次迟到的查询就可能阻塞推理请求。应测量完整特征向量组装时间的分布，包括冷实体和缺失特征；存储整体平均耗时并不等于模型的服务预算。",
      },
    ],
    fit: {
      en: "Store the online feature values your pipeline produces in Lavik. Keep feature definitions, event-time processing and training datasets in your existing pipeline; use Lavik for the key-based reads and updates on the serving path. Separating value capacity from DRAM makes wider records and more retained entities affordable.",
      "zh-CN":
        "将特征流水线生成的在线值存入 Lavik。特征定义、事件时间处理与训练数据集继续由现有流水线负责；Lavik 承担服务链路上的按键读写。让值容量摆脱 DRAM 约束，使更宽的记录与更多保留实体更经济。",
    },
    valueDriver: {
      en: "Entity cardinality × feature width × model versions",
      "zh-CN": "实体基数 × 特征宽度 × 模型版本数",
    },
    serving: {
      en: "Inference / recommendation service",
      "zh-CN": "推理 / 推荐服务",
    },
    origin: {
      en: "Feature pipeline + application materializer",
      "zh-CN": "特征流水线 + 应用物化程序",
    },
    equation: {
      en: "Value payload ≈ entities × serialized feature bytes × simultaneously served versions",
      "zh-CN": "值数据量 ≈ 实体数 × 序列化特征字节数 × 同时服务的版本数",
    },
    decisions: [
      {
        title: {
          en: "Make the serving contract versioned",
          "zh-CN": "对服务契约进行版本管理",
        },
        body: {
          en: "Choose packed strings or hashes based on the operations your client actually uses. Include schema/model version and an as-of timestamp in the record. Define defaults for absent fields and a freshness cutoff independently of storage expiry.",
          "zh-CN":
            "根据客户端实际执行的操作选择打包字符串或哈希。记录中包含模式/模型版本和数据时间戳。为缺失字段定义默认值，并独立于存储过期时间定义新鲜度截止条件。",
        },
      },
      {
        title: {
          en: "Account for the entire lookup fan-out",
          "zh-CN": "计算完整查询扇出",
        },
        body: {
          en: "Budget entity reads, feature decoding, joins, and inference separately. Benchmark bounded HMGET/MGET requests with the real feature width. Atomic writes to a record do not by themselves provide an event-time-consistent snapshot across all entities.",
          "zh-CN":
            "分别预算实体读取、特征解码、关联与推理耗时。用真实特征宽度测试有界 HMGET/MGET 请求。对单条记录进行原子写入，并不会自动提供跨所有实体的事件时间一致快照。",
        },
      },
      {
        title: {
          en: "Test your connector, not just its command names",
          "zh-CN": "验证连接器，而不只是命令名称",
        },
        body: {
          en: "Map connector initialization, Lua calls, pipelines, field expiry, and serialization to the versioned command reference. The verified client examples are useful starting points; they do not certify Feast or another feature-store connector. Plan backfill throttling and reconciliation after lag.",
          "zh-CN":
            "将连接器初始化、Lua 调用、流水线、字段过期和序列化映射到版本化命令参考。已验证的客户端示例可作为起点，但不代表已认证 Feast 或其他特征存储连接器。为回填限流和延迟后的对账做好计划。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Cold-entity inference",
          "zh-CN": "冷实体推理",
        },
        measure: {
          en: "Replay production entity distributions plus a uniform-access stress case at full feature width.",
          "zh-CN": "回放生产实体分布，并以完整特征宽度增加均匀访问压力测试。",
        },
        accept: {
          en: "Feature-assembly p99 fits its portion of the inference budget; missing/stale feature rates remain acceptable.",
          "zh-CN":
            "特征组装 p99 满足推理链路分配的预算，缺失或过期特征比例可接受。",
        },
      },
      {
        title: {
          en: "Backfill during serving",
          "zh-CN": "在线服务期间回填",
        },
        measure: {
          en: "Read while refreshing or backfilling a second model version; retain application timestamps.",
          "zh-CN": "刷新或回填第二个模型版本时持续读取，并保留应用时间戳。",
        },
        accept: {
          en: "Read deadlines and freshness objectives hold together; the publisher cannot overwrite a newer version with an older event.",
          "zh-CN":
            "读取截止时间与新鲜度目标同时满足；发布程序不会用旧事件覆盖新版本。",
        },
      },
      {
        title: {
          en: "Connector correctness",
          "zh-CN": "连接器正确性",
        },
        measure: {
          en: "Exercise actual connector calls, partial records, absent entities, reconnects, and deserialization failures.",
          "zh-CN":
            "测试真实连接器调用、部分记录、缺失实体、重连与反序列化失败。",
        },
        accept: {
          en: "Returned values and fallback decisions match the existing serving contract before routing inference traffic.",
          "zh-CN": "在引入推理流量前，返回值与回退决策符合现有服务契约。",
        },
      },
    ],
    commands: ["HSET", "HMGET", "HGET", "EXPIRE"],
    related: ["adtech-personalization", "large-application-caches"],
    bestFit: {
      en: "Precomputed, reconstructable feature values with substantial payload per entity and a clear materialization pipeline.",
      "zh-CN":
        "可重建的预计算特征值，每个实体有相当的值数据量，并有明确的物化流水线。",
    },
    boundary: {
      en: "Start with one feature family, preserving its freshness contract and missing-value defaults. Measure the complete feature-fetch budget alongside the model request.",
      "zh-CN":
        "先迁移一个特征族，保留新鲜度约定与缺失值默认策略。结合模型请求测量完整特征获取预算。",
    },
  },
  {
    slug: "sessions-user-profiles",
    group: "workload",
    title: {
      en: "Sessions & user profiles",
      "zh-CN": "会话与用户画像",
    },
    navSummary: {
      en: "Retain more user context across devices.",
      "zh-CN": "跨设备保留更多用户上下文。",
    },
    headline: {
      en: "Retain the context.\nReconsider the memory cost.",
      "zh-CN": "保留用户上下文，\n重新规划内存成本。",
    },
    summary: {
      en: "Retain richer context across users, devices and agents. Use Lavik for Redis-compatible session records and profile hashes, with NVMe SSD capacity for the payload and TTLs for its lifecycle.",
      "zh-CN":
        "保留跨用户、设备与智能体的更丰富上下文。Lavik 提供 Redis 兼容的会话记录与画像 Hash，使用 NVMe SSD 承载值数据，用 TTL 管理生命周期。",
    },
    pressure: [
      {
        en: "Daily active users do not describe the retained dataset. Mobile devices reconnect, users keep multiple sessions, and profile documents accumulate preferences and application state. Extending retention can grow stored bytes without a corresponding increase in peak QPS.",
        "zh-CN":
          "日活用户数不能代表保留数据集。移动设备会重连，用户会保留多个会话，画像文档不断积累偏好和应用状态。延长保留期可能显著增加存储字节数，却不会同比增加峰值 QPS。",
      },
      {
        en: "In-memory capacity makes this retained context expensive. With disk-backed alternatives, a reconnect storm can move cold profiles directly onto the critical request path. The relevant metric is the login or resume experience at the tail, including backend fallback and retries.",
        "zh-CN":
          "全内存容量使这些保留上下文成本高昂。使用磁盘存储方案时，重连风暴会让冷画像直接进入关键请求路径。相关指标是登录或恢复体验的尾部延迟，包括后端回退与重试。",
      },
    ],
    fit: {
      en: "Put profile attributes and application session context in Lavik, while your identity service remains responsible for authentication and revocation. Keep your current key conventions and TTL policy. The capacity benefit grows with profile size, device count and the history you choose to retain.",
      "zh-CN":
        "将画像属性与应用会话上下文存入 Lavik，由身份服务继续负责认证与撤销。沿用现有键命名与 TTL 策略。画像大小、设备数量和保留历史越多，NVMe SSD 容量的价值就越明显。",
    },
    valueDriver: {
      en: "Retained context per user, device, and tenant",
      "zh-CN": "每个用户、设备与租户保留的上下文",
    },
    serving: {
      en: "Application session / profile service",
      "zh-CN": "应用会话 / 画像服务",
    },
    origin: {
      en: "Identity and profile systems + application refresh",
      "zh-CN": "身份与画像系统 + 应用刷新逻辑",
    },
    equation: {
      en: "Value payload ≈ retained sessions × context bytes + retained profiles × profile bytes",
      "zh-CN": "值数据量 ≈ 保留会话数 × 上下文字节数 + 保留画像数 × 画像字节数",
    },
    decisions: [
      {
        title: {
          en: "Separate context from authentication authority",
          "zh-CN": "区分上下文与认证权威状态",
        },
        body: {
          en: "Decide which fields can be rebuilt or served stale and which must be rejected when unavailable. A missing cached preference can fall back to a profile service; a missing or stale revocation record must follow the authentication design's explicit failure policy.",
          "zh-CN":
            "确定哪些字段可以重建或返回旧值，哪些在不可用时必须拒绝请求。缺失缓存偏好可以回退到画像服务；缺失或过期的撤销记录必须遵循认证设计中明确的故障策略。",
        },
      },
      {
        title: {
          en: "Keep expiry and logout testable",
          "zh-CN": "让过期与退出登录可验证",
        },
        body: {
          en: "Distinguish absolute expiry from sliding inactivity expiry. Exercise the exact SET options used for refresh, explicit DEL on logout, and concurrent device updates. Storage-level TTL alone does not implement your full session lifecycle.",
          "zh-CN":
            "区分绝对到期与滑动空闲到期。测试刷新使用的准确 SET 选项、退出登录时的显式 DEL，以及多设备并发更新。存储级 TTL 本身不能实现完整会话生命周期。",
        },
      },
      {
        title: {
          en: "Avoid turning profiles into hot locks",
          "zh-CN": "避免将画像变成热点锁",
        },
        body: {
          en: "Bound record size and update granularity; isolate tenant and schema identifiers in keys. Keep large context updates from sharing a single contended key with tiny critical counters. Measure index memory when the dataset contains many short-lived, small sessions.",
          "zh-CN":
            "限制记录大小与更新粒度，在键中区分租户和模式标识。避免大上下文更新与小型关键计数器争用同一个热点键。若数据集包含大量短生命周期小会话，应实际测量索引内存。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Resume storms",
          "zh-CN": "集中恢复连接",
        },
        measure: {
          en: "Replay returning-user access after idle periods, deployment restarts, and regional traffic shifts.",
          "zh-CN": "回放空闲后、部署重启后及地域流量切换后的回访用户请求。",
        },
        accept: {
          en: "Login/resume p99 and timeout rates meet the application target without overloading the authority service.",
          "zh-CN": "登录/恢复 p99 与超时率满足应用目标，且不会压垮权威服务。",
        },
      },
      {
        title: {
          en: "Expiry and revocation races",
          "zh-CN": "过期与撤销竞争",
        },
        measure: {
          en: "Test expiry, refresh, logout, and concurrent reads using the real session library.",
          "zh-CN": "使用真实会话库测试过期、刷新、退出与并发读取。",
        },
        accept: {
          en: "No request is authorized by stale or missing state contrary to the defined authentication policy.",
          "zh-CN": "不会因过期或缺失状态而违背既定认证策略错误授权请求。",
        },
      },
      {
        title: {
          en: "Failure and reconstruction",
          "zh-CN": "故障与重建",
        },
        measure: {
          en: "Exercise timeouts, connection loss, restart, and restoration from the authoritative source.",
          "zh-CN": "测试超时、连接丢失、重启与从权威数据源恢复。",
        },
        accept: {
          en: "Recovery and fail-closed/fallback behavior are explicitly accepted before storing authoritative sessions.",
          "zh-CN": "在存储权威会话前，明确验收恢复流程以及拒绝/回退行为。",
        },
      },
    ],
    commands: ["SET", "GET", "TTL", "DEL"],
    related: ["gaming-live-services", "large-application-caches"],
    bestFit: {
      en: "Substantial retained user-context payload with an existing authoritative source and a bounded reconstruction path.",
      "zh-CN":
        "有相当规模的保留用户上下文值数据，且具备现有权威源与有界重建路径。",
    },
    boundary: {
      en: "Migrate profile reads first, then exercise expiry, logout and deletion with the application. Include sessions that are renewed while clients retry.",
      "zh-CN":
        "先迁移画像读取，再通过应用检查过期、登出与删除，覆盖客户端重试期间续期的会话。",
    },
  },
  {
    slug: "real-time-leaderboards",
    group: "workload",
    title: {
      en: "Real-time leaderboards",
      "zh-CN": "实时排行榜",
    },
    navSummary: {
      en: "Scale seasons, cohorts, and ranked state.",
      "zh-CN": "扩展赛季、分组与排名状态。",
    },
    headline: {
      en: "More seasons. More cohorts.\nA different capacity equation.",
      "zh-CN": "更多赛季，更多分组，\n重新计算容量成本。",
    },
    summary: {
      en: "Keep regional boards and previous seasons available. Lavik supports Redis sorted-set commands and stores growing collections in independently addressed groups, giving retained rankings a home on NVMe SSD.",
      "zh-CN":
        "持续提供地域榜单与历史赛季的访问。Lavik 支持 Redis 有序集合命令，并将增长的集合存为可独立寻址的分组，让保留排名存于 NVMe SSD。",
    },
    pressure: [
      {
        en: "A single top-100 widget can conceal millions of retained members and thousands of concurrent boards. Keeping previous seasons and regional cohorts online multiplies state even when only a small result window is displayed.",
        "zh-CN":
          "一个前 100 名组件背后，可能保留着数百万成员与数千个并行榜单。即使展示窗口很小，在线保留历史赛季与地域分组也会使状态成倍增长。",
      },
      {
        en: "Moving that state to disk changes the economics, but point-read QPS says little about rank updates, range retrieval, or a heavily contended board. Tail latency must be measured during score bursts and retention cleanup, not only with an idle dataset.",
        "zh-CN":
          "将这些状态移到磁盘会改变成本结构，但点查询 QPS 无法充分说明排名更新、范围读取或高争用榜单的表现。必须在分数突发写入和保留清理期间测量尾延迟，而不只是测试空闲数据集。",
      },
    ],
    fit: {
      en: "Use ZADD, ZINCRBY and rank/range reads to build the same leaderboard patterns your Redis application uses. Lavik 0.1.0 groups large collections so operations can work on relevant portions of the stored object. Size by members, boards and retained seasons; measure rank updates and range reads with your actual board sizes.",
      "zh-CN":
        "使用 ZADD、ZINCRBY 与排名、范围读取，沿用 Redis 应用的榜单模式。Lavik 0.1.0 将大型集合分组，使操作可以处理存储对象的相关部分。按成员数、榜单数与保留赛季规划容量，并用实际榜单大小测量排名更新与范围读取。",
    },
    valueDriver: {
      en: "Members × boards × retained seasons",
      "zh-CN": "成员数 × 榜单数 × 保留赛季数",
    },
    serving: {
      en: "Ranking / leaderboard API",
      "zh-CN": "排名 / 排行榜 API",
    },
    origin: {
      en: "Score event log + application replay worker",
      "zh-CN": "得分事件日志 + 应用回放任务",
    },
    equation: {
      en: "Retained members ≈ members per board × cohorts × seasons; measure bytes per member",
      "zh-CN": "保留成员数 ≈ 每榜成员数 × 分组数 × 赛季数；每成员字节数需实测",
    },
    decisions: [
      {
        title: {
          en: "Partition by product meaning",
          "zh-CN": "按业务含义划分榜单",
        },
        body: {
          en: "Use season, game, region, or cohort boundaries where the ranking contract permits them. A single hot sorted-set key remains a contention target; adding workers does not automatically distribute one board. Global ranking across separate boards needs application logic.",
          "zh-CN":
            "在排名契约允许的情况下，以赛季、游戏、地域或分组划分边界。单个热点有序集合键仍然存在争用；增加工作线程不会自动拆分一个榜单。跨多个榜单的全局排名需要应用逻辑实现。",
        },
      },
      {
        title: {
          en: "Define score and retry semantics",
          "zh-CN": "定义分数与重试语义",
        },
        body: {
          en: "Choose between absolute ZADD scores and incremental ZINCRBY updates. Retrying an increment can apply it twice unless the application provides deduplication. Preserve tie ordering, rank direction, and the treatment of disconnected players.",
          "zh-CN":
            "在 ZADD 绝对分数与 ZINCRBY 增量更新之间做出选择。除非应用提供去重，重试一次增量操作可能导致重复加分。保持并列分数排序、排名方向以及离线玩家处理规则一致。",
        },
      },
      {
        title: {
          en: "Bound ranges and retention work",
          "zh-CN": "限制范围查询与保留清理工作量",
        },
        body: {
          en: "Page through bounded ranking windows. Decide whether seasons expire as complete keys or require explicit member pruning, and measure cleanup alongside writes. Keep a replayable score source if ranked state must be reconstructed.",
          "zh-CN":
            "分页读取有界排名窗口。决定赛季是整键到期，还是需要显式删除成员，并在写入同时测量清理开销。若排名状态需要重建，应保留可回放的得分源。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Score bursts on hot boards",
          "zh-CN": "热点榜单的分数突发",
        },
        measure: {
          en: "Use real board-size distributions and concentration of updates during live events.",
          "zh-CN": "采用真实榜单规模分布与直播活动期间的更新集中度。",
        },
        accept: {
          en: "Score-update and top-N p99/p99.9 fit the product deadlines with bounded client queues.",
          "zh-CN":
            "分数更新与 top-N 查询的 p99/p99.9 满足产品截止时间，客户端队列保持有界。",
        },
      },
      {
        title: {
          en: "Rank and replay correctness",
          "zh-CN": "排名与回放正确性",
        },
        measure: {
          en: "Compare ties, rank direction, pagination, duplicate events, and restart reconstruction.",
          "zh-CN": "对比并列分数、排名方向、分页、重复事件与重启重建。",
        },
        accept: {
          en: "Ranks match the existing contract and replay does not double-apply score changes.",
          "zh-CN": "排名符合现有契约，回放不会重复应用分数变化。",
        },
      },
      {
        title: {
          en: "Season rollover",
          "zh-CN": "赛季切换",
        },
        measure: {
          en: "Retain old boards while creating new cohorts and expiring or pruning old state.",
          "zh-CN": "保留旧榜单的同时创建新分组，并对旧状态执行过期或裁剪。",
        },
        accept: {
          en: "Usable capacity and memory stay within budget without disrupting live board latency.",
          "zh-CN": "可用容量与内存保持在预算内，同时不破坏在线榜单延迟。",
        },
      },
    ],
    commands: ["ZADD", "ZINCRBY", "ZREVRANGE", "ZREVRANK", "EXPIRE"],
    related: ["gaming-live-services", "sessions-user-profiles"],
    bestFit: {
      en: "A growing portfolio of retained boards with clear cohort boundaries and replayable source events.",
      "zh-CN": "持续增长的保留榜单集合，具备明确分组边界和可回放源事件。",
    },
    boundary: {
      en: "Benchmark sorted-set operations with your member counts and score-update distribution. The GET/SET reports explain the storage foundation; leaderboard sizing should use ZSET traffic.",
      "zh-CN":
        "使用实际成员数量与分数更新分布测试有序集合操作。GET/SET 报告说明存储基础，榜单容量应按 ZSET 流量规划。",
    },
  },
  {
    slug: "ecommerce-marketplaces",
    group: "industry",
    title: {
      en: "E-commerce & marketplaces",
      "zh-CN": "电商与交易平台",
    },
    navSummary: {
      en: "Catalog breadth without a memory-capacity tax.",
      "zh-CN": "扩展商品覆盖，降低内存容量负担。",
    },
    headline: {
      en: "Keep the catalog close.\nKeep capacity costs down.",
      "zh-CN": "让完整商品目录触手可及，\n降低容量成本。",
    },
    summary: {
      en: "Keep the full storefront ready to serve: product snapshots, offers, locale variants and merchandising data. Lavik moves retained values from DRAM to NVMe SSD while keeping the Redis-compatible lookup path.",
      "zh-CN":
        "让完整店面随时可用：商品快照、报价、语言变体与展示数据。Lavik 将保留值从 DRAM 移至 NVMe SSD，同时保留 Redis 兼容的查询路径。",
    },
    pressure: [
      {
        en: "A SKU is rarely one cached record. Markets, sellers, currencies, fulfillment regions, experiments, and content variants create many serving representations. Evicting the long tail saves DRAM by moving latency and database load onto the first shopper who needs it.",
        "zh-CN":
          "一个 SKU 往往不止对应一条缓存记录。市场、卖家、币种、履约地域、实验与内容变体都会产生多种服务表示。淘汰长尾能够节省 DRAM，却会把延迟和数据库负载转移给第一个需要它的消费者。",
      },
      {
        en: "SSD-backed reads must still fit product-page and browse deadlines during a promotion. A disk tier that looks acceptable at average traffic can expose latency when shoppers suddenly spread across a wider catalog and refresh writes compete for I/O.",
        "zh-CN":
          "促销期间，SSD 读取仍须满足商品页与浏览链路的截止时间。当消费者突然访问更广的商品范围，且刷新写入争用 I/O 时，平常流量下看似可接受的磁盘层可能暴露出延迟问题。",
      },
    ],
    fit: {
      en: "Materialize catalog and offer snapshots in Lavik, refreshed by your existing commerce pipeline. Retain more seller, market and locale variants without storing every value in DRAM. Browsing services read prepared records; checkout keeps authoritative inventory and price checks in the commerce platform.",
      "zh-CN":
        "通过现有电商流水线将商品与报价快照写入 Lavik。保留更多卖家、市场与语言变体，而无需将每个值存于 DRAM。浏览服务读取准备好的记录；结账流程仍在电商平台完成权威库存与价格检查。",
    },
    valueDriver: {
      en: "Catalog breadth, seller offers, locales, and snapshot versions",
      "zh-CN": "商品覆盖、卖家报价、地区语言与快照版本",
    },
    serving: {
      en: "Browse / product-page service",
      "zh-CN": "浏览 / 商品详情页服务",
    },
    origin: {
      en: "Catalog and pricing databases + application CDC consumers",
      "zh-CN": "商品与定价数据库 + 应用 CDC 消费程序",
    },
    equation: {
      en: "Value payload ≈ SKUs × serving variants × average snapshot bytes × retained versions",
      "zh-CN": "值数据量 ≈ SKU 数 × 服务变体数 × 平均快照字节数 × 保留版本数",
    },
    decisions: [
      {
        title: {
          en: "Keep the purchasing authority clear",
          "zh-CN": "明确购买流程的权威边界",
        },
        body: {
          en: "Use cached price and availability as serving snapshots with explicit versions and freshness rules. Checkout must perform the platform's authoritative price, inventory, and reservation checks. A fast key-value lookup does not implement stock reservation or a payment ledger.",
          "zh-CN":
            "缓存价格和可用性应是具有明确版本与新鲜度规则的服务快照。结账仍须执行平台的权威价格、库存与预留检查。快速键值查询并不能实现库存预留或支付账本。",
        },
      },
      {
        title: {
          en: "Make key geometry follow the storefront",
          "zh-CN": "让键结构对应实际店面",
        },
        body: {
          en: "Include tenant/seller, market, locale, and snapshot version where they change the response. Bound MGET fan-out for a product grid. Store prepared representations when that reduces expensive joins, while measuring duplicated payload against the saved request work.",
          "zh-CN":
            "对于会改变响应的维度，在键中包含租户/卖家、市场、语言地区与快照版本。限制商品列表的 MGET 扇出。如果预先准备表示可以减少昂贵关联，应同时比较重复值数据的成本与节省的请求工作。",
        },
      },
      {
        title: {
          en: "Make refresh idempotent",
          "zh-CN": "让刷新过程具备幂等性",
        },
        body: {
          en: "Handle duplicate and out-of-order events in the CDC consumer. Use application versions or reconciliations to prevent stale materialization, and spread expirations to avoid synchronized refill. Connect your existing CDC consumer to Lavik through its Redis-compatible interface.",
          "zh-CN":
            "在 CDC 消费程序中处理重复和乱序事件。通过应用版本或对账防止旧数据物化，并分散过期以避免同步回填。通过 Redis 兼容接口，将现有 CDC 消费程序连接到 Lavik。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Promotion traffic",
          "zh-CN": "促销流量",
        },
        measure: {
          en: "Replay hot-item spikes and broad catalog discovery while refreshing offers.",
          "zh-CN": "在刷新报价的同时回放热门商品突发和广泛商品浏览。",
        },
        accept: {
          en: "Browse/product-page tail latency and origin traffic satisfy the event plan.",
          "zh-CN": "浏览/商品页尾延迟与源站流量满足活动计划。",
        },
      },
      {
        title: {
          en: "Freshness under update lag",
          "zh-CN": "更新延迟下的新鲜度",
        },
        measure: {
          en: "Inject duplicate, delayed, and reordered catalog/price events into your consumer.",
          "zh-CN": "向消费程序注入重复、延迟和乱序的商品/价格事件。",
        },
        accept: {
          en: "Visible versions do not regress, and stale snapshots follow the storefront's explicit policy.",
          "zh-CN": "可见版本不会回退，过期快照按店面既定策略处理。",
        },
      },
      {
        title: {
          en: "Multi-market capacity",
          "zh-CN": "多市场容量",
        },
        measure: {
          en: "Load realistic seller, market, locale, and version combinations; measure payload duplication.",
          "zh-CN": "载入真实卖家、市场、语言地区与版本组合，测量值数据重复量。",
        },
        accept: {
          en: "Compare complete serving cost at equal catalog coverage, freshness, and latency targets.",
          "zh-CN": "在商品覆盖、新鲜度和延迟目标相同的条件下比较完整服务成本。",
        },
      },
    ],
    commands: ["SET", "MGET", "DEL"],
    related: ["large-application-caches", "online-feature-serving"],
    bestFit: {
      en: "Large, rebuildable commerce read models where catalog coverage and variant count drive memory spend.",
      "zh-CN": "商品覆盖与变体数量主导内存支出的、大型且可重建的电商读取模型。",
    },
    boundary: {
      en: "Launch with a catalog partition or market. Compare browse latency, source-database load and freshness through a promotion cycle before expanding coverage.",
      "zh-CN":
        "先迁移一个商品分区或市场，在促销周期内比较浏览延迟、源数据库负载与新鲜度，再扩大覆盖范围。",
    },
  },
  {
    slug: "adtech-personalization",
    group: "industry",
    title: {
      en: "Adtech & personalization",
      "zh-CN": "广告技术与个性化",
    },
    navSummary: {
      en: "Broader decision context within a latency budget.",
      "zh-CN": "在延迟预算内获取更广泛的决策上下文。",
    },
    headline: {
      en: "Retain more decision context.\nProtect the request deadline.",
      "zh-CN": "保留更多决策上下文，\n守住请求截止时间。",
    },
    summary: {
      en: "Keep more audience and campaign context within reach of each decision. Lavik serves Redis-compatible profile lookups from NVMe SSD, helping high-cardinality datasets grow without an all-memory capacity bill.",
      "zh-CN":
        "让每次决策都能访问更丰富的受众与活动上下文。Lavik 从 NVMe SSD 提供 Redis 兼容画像查询，使高基数数据集增长无需承担全内存容量成本。",
    },
    pressure: [
      {
        en: "Audience profiles, segment snapshots, creative metadata, and campaign variants grow with reachable users and retention, not just impressions per second. A small memory hot set may not capture the next burst of identities or an expanded campaign audience.",
        "zh-CN":
          "受众画像、分组快照、创意元数据和活动变体随可触达用户与保留期增长，并不只取决于每秒展示数。小内存热集可能无法覆盖下一波身份请求或扩展后的活动受众。",
      },
      {
        en: "The deadline is unforgiving: a context read that arrives after the decision is useless even if it succeeds. SSD capacity is valuable only when the qualifying workload delivers enough useful responses on time. Record late responses and fallback decisions, not just server QPS.",
        "zh-CN":
          "截止时间不会等待：即使上下文查询最终成功，在决策之后到达也没有价值。只有当经验证的负载能按时提供足够有效响应时，SSD 容量才有意义。除了服务端 QPS，还要记录迟到响应与回退决策。",
      },
    ],
    fit: {
      en: "Use Lavik for profile payloads, campaign snapshots and enrichment records on the decision path. Its billion-key SPDK benchmark delivers 385,514 GET QPS at 0.439 ms p99.9 with 80 connections. That is a concrete starting point for a load test using your own fan-out, record sizes and decision deadline.",
      "zh-CN":
        "使用 Lavik 保存决策链路上的画像值、活动快照与信息补全记录。在十亿键 SPDK 基准中，80 个连接下 GET 为 385,514 QPS、p99.9 为 0.439 ms。可据此用实际扇出、记录大小与决策截止时间设计负载测试。",
    },
    valueDriver: {
      en: "Reachable identities × context width × retention",
      "zh-CN": "可触达身份数 × 上下文宽度 × 保留期",
    },
    serving: {
      en: "Decision / personalization service",
      "zh-CN": "决策 / 个性化服务",
    },
    origin: {
      en: "Audience and campaign pipelines + application publishers",
      "zh-CN": "受众与活动流水线 + 应用发布程序",
    },
    equation: {
      en: "Value payload ≈ retained identities × profile bytes + campaign/context snapshots",
      "zh-CN": "值数据量 ≈ 保留身份数 × 画像字节数 + 活动/上下文快照",
    },
    decisions: [
      {
        title: {
          en: "Budget the decision, not one GET",
          "zh-CN": "预算完整决策，而不只是一次 GET",
        },
        body: {
          en: "Subtract network, fan-out, decoding, model/scoring, and downstream time from the total deadline. Use bounded batches where their semantics fit. Define what a missing or late profile means before load testing; do not hide deadline misses inside client retries.",
          "zh-CN":
            "从总截止时间中扣除网络、扇出、解码、模型/评分与下游耗时。在语义合适的情况下使用有界批次。负载测试前定义画像缺失或迟到的处理方式，不要让客户端重试掩盖截止时间违约。",
        },
      },
      {
        title: {
          en: "Separate payload serving from contended counters",
          "zh-CN": "区分值数据服务与高争用计数器",
        },
        body: {
          en: "Profile lookups and per-event budget/frequency updates have different contention and correctness needs. Use idempotency keys and test retries for counters; keep cross-key budget enforcement explicit in the application.",
          "zh-CN":
            "画像查询与逐事件预算/频次更新在争用和正确性方面有不同需求。为计数器使用幂等键并测试重试，在应用中明确跨键预算约束。",
        },
      },
      {
        title: {
          en: "Propagate change and deletion deliberately",
          "zh-CN": "有计划地传播变更与删除",
        },
        body: {
          en: "Version audience and campaign records in application publishers, bound freshness, and test explicit invalidation across serving copies. Cache TTL is a retention tool; it does not by itself implement your application's consent, suppression, or deletion workflow.",
          "zh-CN":
            "在应用发布程序中对受众和活动记录进行版本管理，限制数据陈旧时间，并测试所有服务副本的显式失效。缓存 TTL 是保留工具，本身并不能实现应用的同意、屏蔽或删除工作流。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Deadline-constrained lookup load",
          "zh-CN": "受截止时间约束的查询负载",
        },
        measure: {
          en: "Use an arrival-rate-controlled generator and the real fan-out, payload sizes, and cold-key fraction.",
          "zh-CN":
            "使用控制请求到达率的发生器，采用真实扇出、值大小与冷键比例。",
        },
        accept: {
          en: "Useful responses before the deadline meet the target; queues and retry traffic remain bounded.",
          "zh-CN": "截止时间前的有效响应达到目标，队列与重试流量保持有界。",
        },
      },
      {
        title: {
          en: "Audience expansion and churn",
          "zh-CN": "受众扩展与更替",
        },
        measure: {
          en: "Grow the keyspace and rotate active cohorts while publishers update records.",
          "zh-CN": "发布程序更新记录时，增加键空间并切换活跃群体。",
        },
        accept: {
          en: "Decision p99/p99.9, fallback rate, and freshness remain acceptable across transitions.",
          "zh-CN": "群体切换期间，决策 p99/p99.9、回退率与新鲜度保持可接受。",
        },
      },
      {
        title: {
          en: "Counter and invalidation correctness",
          "zh-CN": "计数器与失效正确性",
        },
        measure: {
          en: "Test the exact update scripts, retries, duplicates, and deletion propagation used by the application.",
          "zh-CN": "测试应用实际使用的更新脚本、重试、重复请求与删除传播。",
        },
        accept: {
          en: "Business invariants hold independently of the successful profile-read benchmark.",
          "zh-CN": "业务不变量得到满足，不以画像读取基准成功替代验证。",
        },
      },
    ],
    commands: ["SET", "MGET", "DEL"],
    related: ["online-feature-serving", "large-application-caches"],
    bestFit: {
      en: "High-cardinality, reconstructable enrichment payload with measured per-request latency headroom.",
      "zh-CN": "高基数、可重建的信息补全值数据，且每请求延迟余量经过实测。",
    },
    boundary: {
      en: "Set a store-service budget inside the end-to-end decision deadline. Track late responses and fallbacks, and reserve capacity for audience changes and campaign launches.",
      "zh-CN":
        "在端到端决策截止时间内设置存储服务预算。跟踪迟到响应与回退，并为受众变化与活动上线预留容量。",
    },
  },
  {
    slug: "gaming-live-services",
    group: "industry",
    title: {
      en: "Gaming & live services",
      "zh-CN": "游戏与在线服务",
    },
    navSummary: {
      en: "Keep player state and past seasons accessible.",
      "zh-CN": "持续提供玩家状态与历史赛季访问。",
    },
    headline: {
      en: "More players. More retained state.\nLess capacity tied to DRAM.",
      "zh-CN": "更多玩家，更多保留状态，\n减少容量对 DRAM 的依赖。",
    },
    summary: {
      en: "Welcome returning players without rebuilding every profile from the origin. Lavik keeps player context, social data and seasonal read models on NVMe SSD, accessible through familiar Redis commands.",
      "zh-CN":
        "迎接回归玩家，无需从源站重建每份画像。Lavik 将玩家上下文、社交数据与赛季读取模型保留在 NVMe SSD 上，通过熟悉的 Redis 命令访问。",
    },
    pressure: [
      {
        en: "Concurrent players determine traffic, but registered players, regions, game modes, and retained seasons determine capacity. Dropping inactive players from memory reduces cost by making the next return or event-driven reactivation more expensive.",
        "zh-CN":
          "同时在线玩家决定流量，而注册玩家、地域、游戏模式与保留赛季决定容量。将不活跃玩家从内存中移除能够降低成本，却会提高下次回归或活动触发重新活跃时的访问代价。",
      },
      {
        en: "A disk-backed serving layer needs to handle those returning players while active sessions continue. Measure bursts of profile hydration, writes from progression events, and ranking reads together; smooth average traffic understates a launch or season reset.",
        "zh-CN":
          "磁盘服务层需要在活跃会话持续运行时处理回归玩家。应一起测量画像加载突发、进度事件写入与排名读取；平滑平均流量低估了上线或赛季重置时的压力。",
      },
    ],
    fit: {
      en: "Use Lavik for player profile hashes, cached progression views and seasonal rankings. Values grow on NVMe SSD as the registered population and retained seasons increase. Keep progression events and account balances in their authoritative workflow, and publish the serving views into Lavik.",
      "zh-CN":
        "使用 Lavik 保存玩家画像 Hash、进度缓存视图与赛季排名。随着注册玩家与保留赛季增加，值数据在 NVMe SSD 上扩展。进度事件与账户余额由权威工作流负责，并将服务视图发布到 Lavik。",
    },
    valueDriver: {
      en: "Registered players, game modes, regions, and retained seasons",
      "zh-CN": "注册玩家、游戏模式、地域与保留赛季",
    },
    serving: {
      en: "Player services / social and ranking APIs",
      "zh-CN": "玩家服务 / 社交与排名 API",
    },
    origin: {
      en: "Game-state database or event log + application projections",
      "zh-CN": "游戏状态数据库或事件日志 + 应用投影程序",
    },
    equation: {
      en: "Value payload ≈ retained players × context bytes × game/region variants; size ranked members separately",
      "zh-CN":
        "值数据量 ≈ 保留玩家数 × 上下文字节数 × 游戏/地域变体数；排名成员另行规划",
    },
    decisions: [
      {
        title: {
          en: "Separate serving context from authoritative progression",
          "zh-CN": "区分服务上下文与权威进度",
        },
        body: {
          en: "Cache or materialize profiles with explicit source versions. Keep entitlement, inventory, and balance invariants in their authoritative workflow until equivalent failure semantics are demonstrated. A read-model rebuild must not re-award rewards or double-apply events.",
          "zh-CN":
            "缓存或物化画像时附带明确的源版本。除非已证明等价故障语义，权益、库存与余额不变量仍由权威工作流负责。读取模型重建不能重复发放奖励或重复应用事件。",
        },
      },
      {
        title: {
          en: "Partition the audience deliberately",
          "zh-CN": "有计划地划分玩家群体",
        },
        body: {
          en: "Include game, region, and season in the key design when they change semantics. Bound profile/document size and ranking windows. Measure small hot cohorts separately from broad returning-player reads; one global board can behave very differently from many regional boards.",
          "zh-CN":
            "当游戏、地域和赛季改变语义时，将其纳入键设计。限制画像/文档大小与排名窗口。分别测量小型热门群体和广泛回归玩家的读取；一个全局榜单可能与多个地域榜单表现完全不同。",
        },
      },
      {
        title: {
          en: "Design the return and rollover paths",
          "zh-CN": "设计回归与赛季切换路径",
        },
        body: {
          en: "Throttle reconstruction after a restart or event launch. Define old-season retention, expiry, and replay order. Verify the actual session and sorted-set command sequences rather than inferring framework compatibility from RESP support.",
          "zh-CN":
            "在重启或活动上线后的重建中实施限流。定义旧赛季保留、过期与回放顺序。应验证实际会话与有序集合命令序列，不要从 RESP 支持推断框架兼容性。",
        },
      },
    ],
    trials: [
      {
        title: {
          en: "Event and reconnect bursts",
          "zh-CN": "活动与重连突发",
        },
        measure: {
          en: "Replay returning-player loads alongside ongoing progression writes and social/profile reads.",
          "zh-CN": "在持续进度写入与社交/画像读取同时回放回归玩家负载。",
        },
        accept: {
          en: "Player-facing tail latency and timeout rates meet the launch budget with controlled origin traffic.",
          "zh-CN": "玩家可见尾延迟与超时率满足上线预算，且源站流量可控。",
        },
      },
      {
        title: {
          en: "Season transition",
          "zh-CN": "赛季转换",
        },
        measure: {
          en: "Keep prior seasons accessible while new cohorts populate and old data expires.",
          "zh-CN": "在新群体写入和旧数据到期时，保持历史赛季可访问。",
        },
        accept: {
          en: "Rollover fits memory/SSD headroom and does not degrade current-season read/write deadlines.",
          "zh-CN":
            "赛季切换不超出内存/SSD 余量，且不会破坏当前赛季读写截止时间。",
        },
      },
      {
        title: {
          en: "Projection rebuild",
          "zh-CN": "投影重建",
        },
        measure: {
          en: "Inject duplicate and reordered events and rebuild the serving state after interruption.",
          "zh-CN": "注入重复和乱序事件，并在中断后重建服务状态。",
        },
        accept: {
          en: "Profiles and ranks agree with authoritative state; rewards and increments are not applied twice.",
          "zh-CN": "画像与排名和权威状态一致，奖励与增量不会重复应用。",
        },
      },
    ],
    commands: ["HSET", "HMGET", "EXPIRE", "DEL"],
    related: ["real-time-leaderboards", "sessions-user-profiles"],
    bestFit: {
      en: "Growing retained player context with a durable authoritative source and clear regional or seasonal boundaries.",
      "zh-CN": "持续增长的保留玩家上下文，具备持久权威源与明确地域或赛季边界。",
    },
    boundary: {
      en: "Begin with player context in one region. Rehearse reconnect spikes, season rollover and view rebuilds before extending the rollout to more games or regions.",
      "zh-CN":
        "先从一个地域的玩家上下文开始。在推广到更多游戏或地域前，演练集中重连、赛季切换与视图重建。",
    },
  },
]);
export type UseCase = z.infer<typeof useCaseSchema>;
