# 最新 main 大对象写入复测：工作负载审计

本轮覆盖此前全部 **8 组写入负载、11 个不同写命令**：SET、SETRANGE、HSET、LPUSH/RPOP、ZINCRBY、ZREM/ZADD、XADD MAXLEN，以及补充的 SADD/SREM。RPUSH 只用于 List 装载；没有独立测试 LSET、HDEL、XTRIM 或其他新增写命令。六个全量读不属于本轮写入复测。

固定 main 为 `9c68079a7dd775db647cf55fe578a6cd43426a82`；复用已构建二进制 SHA-256 `4fe9c53a6b1ebcff1bce17ce3aac213e879f20b82f09a326ae02560a792056c3`。这是源码/历史客户端审计，不替代本轮远程二进制及运行配置检查。

## 每 key 的数据与正式操作

8,192 keys；每 key 用户 payload 为 1,048,576 字节，合计 8 GiB，另加 key、字段名、score、Stream ID 及内部元数据。

| 负载 | 装载后每 key | 正式操作 |
|---|---|---|
| SET | 一个 1 MiB String | 随机 key，全量覆盖 1 MiB。 |
| SETRANGE | 一个 1 MiB String | 随机 key，随机字节偏移 `0..1,048,320`（含两端），覆盖 256 B，长度保持 1 MiB。 |
| HSET | 4,096 个字段 `f0..f4095`，每个 value 256 B | 随机 key、随机已有字段，覆盖 256 B；HSET 返回 0。 |
| LPUSH/RPOP | 4,096 个 256 B 元素 | 同一个随机 key 上先 LPUSH 一个 256 B 元素，收到回复后 RPOP 一个；完整操作对后长度恢复 4,096。 |
| ZINCRBY | 32,768 个 32 B member；初始 score 为 member ID `0..32767` | 随机 key、随机 member，随机 `+32768` 或 `-32768`，促使 score 重排；不添加/删除成员。 |
| ZREM/ZADD | 同上 | 每连接固定一个 member slot（connection ID）；在随机 key 上先删旧 member，再添加 a/b 后缀相反的新 member，score=`该连接操作序号 % 32768`。 |
| XADD MAXLEN | 4,096 条 entry；每条一个名为 `payload` 的字段，value 256 B | `XADD key MAXLEN = 4096 * payload <256B>`：追加后精确裁剪到 4,096。没有 `~`，也没有另发 XTRIM；自动 ID 随执行时间产生。 |
| SADD/SREM | 32,768 个 32 B member，无 score | 每连接固定 member slot，在随机 key 上先添加后缀相反的新 member，再删除旧 member。 |

Set/ZSet member 格式为 `m` + 30 位补零十进制 slot + `a`/`b`，共 32 B。初始全部为 a。ZREM/ZADD 和 SADD/SREM 在 80 连接下仅修改每 key 的 **80/32,768 个 slot**，其余成员构成大对象背景；不可描述成“随机更新全部成员”。ZINCRBY 则从全部 32,768 个 member 中选择。

## 可重复性与客户端身份

原七项来自 `work/main-large-objects-c80-20261015/runner.py`，源代码实际为 `work/large-objects-20261014/bench.cpp`：源码 SHA-256 `ab2446bcd3147ebe62b7ca450b5520634469082081b705f6872f314d5ce36780`，历史客户端二进制 SHA-256 `f596a6f1a5a1a600c5cec3240e0f56a0dd56f338283d5666e38a4c82ccb62b08`。

SADD/SREM 来自 `work/main-large-reads-set-c80-20261016/bench.cpp` 和对应 runner：源码 SHA-256 `325d8822c108d1f1be387fc4d386d16190a33753a5490305cb33b20990e4fae4`（与归档源码相同），历史客户端二进制 SHA-256 `3f52c506cb5927b62c7ca6e295a7e6d14f89865f6685b69841ff9e67a58ca39d`。

此前正式设置为 80 连接、16 个客户端线程（固定 CPU 0–15）、pipeline 1，各一轮：装载 seed 101；预热 90 秒、seed 10180；正式 60 秒、seed 20180。SADD/SREM 客户端另传 `--load-seed 101`，该选项用于整读验值，写入数据生成仍由各阶段 `--seed` 控制。应复用各自已有客户端，避免把新增整读解析等客户端改动引入原七项比较。

- 每线程使用 `mt19937_64(seed + 常量 × (tid+1))`；key 按随机数模 keys 选择。原始数据和选择规则可重复，但 epoll 完成次序影响每连接消耗的随机数顺序；相同 seed 不等于跨系统逐请求完全相同的序列。
- 256 B value 由 seed、key/连接 ID、member/操作序号生成，整个 value 都变化，避免只改短前缀造成大量重复 body。String 1 MiB 使用固定种子 17 生成的共同主体，仅前缀加入 seed、ID、序号标签；不能称不同 key 的整个 1 MiB 相互独立。Set/ZSet 成员多为补零文本，并非低压缩率随机字节。
- 全量装载按连接 ID 分片 key。每 key 装载命令数：String 1，Hash/List 64（每命令 64 项），ZSet/Set 256（每命令 128 项），Stream 4,096（每命令 1 entry）。对应总数分别为 8,192、524,288、2,097,152、33,554,432，可由成功回复计数核对，无需 DBSIZE 或全键扫描。

## 操作对与状态风险

- LPUSH/RPOP、ZREM/ZADD、SADD/SREM 的 `OPERATIONS` 统计为 **pairs/s**，其延迟从第一条命令开始到第二条回复完成；不可把它标成两条命令合计 QPS。各子命令指标另存，子命令计数都应与完整 pair 计数相同。分位数不能相加得到 pair 分位数。
- 客户端到达时间边界后完成已经开始的第二条命令才退出。List 在并发时可以临时超过 4,097；原客户端允许 LPUSH 回复在 `4097..4096+connections`，RPOP 校验 256 B。不能要求弹出值就是本连接刚推入的值，因为其他连接也可选中同一个 key。异常退出可能留下一半操作对，不能直接续跑。
- ZREM/ZADD 先减后增，临时 cardinality 可降低；SADD/SREM 先增后减，临时可升高。全部 pair 耗尽后均回到 32,768。每连接每 key 的 a/b toggle 必须在预热和正式间通过同一个 `state.bin` 保留；fresh load 后清空旧状态。状态文件容量为 1,280×keys 字节，加两个 4 字节整数头，8,192 keys 时为 10,485,768 字节。状态只在成功结束时保存；失败后不能信任磁盘状态与库中成员仍一致。
- 正式阶段每连接操作序号从 1 重新开始，a/b toggle 继续预热后的状态；zswap 的新 score 可以重复，不应以此判错。
- 时间包含客户端排队、发送、接收和回复解析/校验；常规请求构造在单命令计时起点之前，操作对计时还包含两命令之间的客户端处理。它不是纯服务端执行时间。微秒四舍五入采样，结束时排空已发请求导致实际 elapsed 可略大于设定时长。
- 原写入验值主要检查回复及 3 个 key 的结构/长度；不等于逐字节验证所有写入后的完整数据库。不能把补充整读的每回复全量内容校验描述套到这些写入负载。

## 文档与范围

已参考固定 main 的 `AGENTS.md`、文档/operations 索引、构建/SPDK 指南、Grouped collections 与 Streams 架构，按源代码确定实际语义。任务报告仅列非默认配置，原始 launch/build 清单可保存精确设置。保持 defrag 开启，沿用已验证服务器/客户端与六盘 SPDK，干净停止并检查 checkpoint，不重启、不扫描全库。

原七项 `EXPERIMENT.json` 的 `user_steering` 残留 “Only test PR, no baseline rerun”，与该轮最新 main 复测事实不一致；新任务不得复制这句。此前所有写入均已被上述 8 组覆盖，额外的 RPUSH 装载命令和范围/结构验证命令不应列为正式写入性能结果。
