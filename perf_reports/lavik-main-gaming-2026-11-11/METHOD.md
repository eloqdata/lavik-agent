# 实验过程与复现说明

本文件只描述报告所用的最新实验方法与对照口径，不记录此前的调参、候选方案或优化历史。

## 版本与环境

- Lavik：`4b1eb143178955a033635964f291a6f471749d2d`；Bycorf：`150a50f87fe8ea61f2a2cb71ec28fb6e9b570e40`。Release 构建，GCC 13；二进制 SHA-256 见 [构建身份](provenance/build-identity.json)。
- Azure Central US 服务端：Standard_L16aos_v4，16 vCPU、128 GiB RAM、AMD EPYC 9V74，六块本地 NVMe。客户端：Standard_L32aos_v4，32 vCPU、256 GiB RAM，经私网访问服务端。
- 服务端独占 CPU 0–15；客户端 32 线程、320 连接。仅运行一个被测数据库，不同时运行竞品。
- Lavik：SPDK/VFIO 存储、2 GiB HugeTLB，普通 TCP；默认 `spdk-max-completions-per-poll=0`，每次启动用 CONFIG GET 验证。引擎正常维护开启。
- Redis 8.10.2、Valkey 9.1.2：内存配置，AOF 关闭、定时 RDB 保存关闭；记录的 I/O threads 为 8。Dragonfly 2.0.2：16 proactor threads，内存配置。Kvrocks 2.17.0：16 workers，WAL 开启、sync 关闭，使用相同六块 NVMe 的文件系统存储。各窗口 runtime_config 和 `provenance/peers/` 的 INFO 是实际配置证据。
- 各数据库持久化行为不同，本实验不宣称等价的掉电持久性或 SLA。Redis/Valkey/Dragonfly 未测 200 GB 场景。

## 数据与请求

参数完整定义见 [workloads.json](workloads.json)，负载来源为 [Gaming PDF](sources/Gaming_Workloads_for_Lavik.pdf)。

1. **A 全球榜**：10 个 ZSET，每个 1,000 万成员；member 为确定性生成的 32 字节字符串，初始 score 为 member ID × 1024，并非同分。各库均使用排序后的 8192-member ZADD 批次装载，每个 key 一个装载连接。40% `ZREVRANGE 0 99 WITHSCORES`、40% `ZRANK`、20% `ZINCRBY`。改分按 +2048/−2048 配对，每条命令分别计数；写成员按连接分区，避免多个连接同时修改同一成员。Top/rank 的 40/40 拆分及 ±2048 是实验补充假设，PDF 没有规定大跨度改分。
2. **B 对局榜**：初始 100 万 ZSET，每个 50 成员，member ID 在不同对局间不重复。TTL 1800 秒并交错分布。32 个创建连接按约 555.56 新榜/秒补充，288 个更新连接执行 `ZADD XX CH`，避免过期后意外重建。持续运行 1860 秒，覆盖完整 TTL 周期。创建 QPS 是固定到达负载，不用于排名；比较更新吞吐，同时保留创建滞后、活跃 key 数、过期和错误记录。
3. **C 玩家状态**：1,000 万 Hash，每个 16 字段，每个字段值 128 B，共 20.48 GB 逻辑用户值。90% `HGETALL`，10% `HSET f00` 更新一个字段；分别使用 5% 和 10% 热点集合，承担 90% 请求。字段值有 48 字节 ASCII 十六进制身份前缀及 80 字节确定性二进制后缀，因此可压缩。非热点不等于每次读盘。
4. **C 200 GB**：同样方法扩展为 1 亿 Hash，204.8 GB 逻辑用户值，仅 Lavik/Kvrocks 对比；与 20 GB 结果分表统计。

## 本轮执行顺序

1. 固定 Lavik 与 Bycorf 提交，独立完成编译，记录服务端和客户端二进制散列。保存并校验机器原有数据，测试使用隔离的装载/清理阶段。
2. 暂停两台机器的 apt 更新、固件刷新、motd、临时文件清理、man-db、logrotate、fstrim 等定时任务，并设置独立恢复机制；已有维护任务结束后才开始。正式计时期间没有 perf、构建或连续系统监控。
3. 按 **A → C 20 GB → B → C 200 GB** 执行。每个 workload 重新装载；记录空库、装载后及测试后的内存，正式计时前后校验数据。
4. A/C 每种热点设置先预热 10 秒，再测量 60 秒，三轮，种子 1108、1109、1110。计时结束后完成当前命令周期，保持规定读写比例；QPS 分母使用实际 elapsed_s，包括收尾时间。B 单独运行完整 31 分钟。
5. 计时边界外读取服务端 commandstats 和存储计数，等待必要的写入排空；核对命令计数与客户端实际回复完全一致。所有保留窗口的客户端错误数为 0。
6. 全量验证：A 检查所有成员及分数；C 在前后遍历所有 Hash 检查完整内容。C 的每条计时回复检查形状、长度、key/field/version 身份，每连接每 1024 次读取完整核对二进制后缀。并发可变字段接受自洽的有效版本；这不是完整线性一致性审计。
7. 记录最终内存、归档原始结果，核对 16 个 Lavik point JSON 与原始压测档案一致；恢复原有数据和系统维护任务。两台 VM 保持开机，被测服务停止。

## 统计与对照来源

- A/C：三轮 QPS 中位数；HTML 的平均延迟为各轮平均延迟的中位数，P99 为各轮 P99 的中位数，不能解读为合并所有请求后的分位数。原始 point 文件保留 P99.9、请求数、elapsed_s 等。
- B：完整周期的更新 QPS；创建/TTL 指标单独列出。
- 命令 QPS 来自混合负载，受其他命令及固定命令周期影响，尤其不能用 Kvrocks A 的混合结果推断其单条 Top100 或 ZINCRBY 的独立上限。
- 内存为 `cgroup_memory_bytes + hugetlb_bytes`，包含可回收文件页缓存；逻辑容量不等于驻留内存或物理占盘。
- Lavik 为本轮新测的 16 窗口；四个竞品复用本报告所选同规模、同命令分布、320 连接的有效对照窗口。只保留这 46 个对照窗口，不附旧 Lavik 或历史实验。实际测量时间见 [README](README.md#测量日期与边界) 和 [sources.json](sources.json)。不是同一天的随机交叉 A/B，不能把差异完全归因于单个参数。

## 压测源码与执行入口

`harness/` 保存实际压测源码和测量包装器。源文件与二进制分别记录散列；编译器/依赖不同可能使二进制散列不同。源码是 Linux C++20，依赖 pthread 和 POSIX socket/epoll。

```sh
mkdir -p bin
for name in workload workload-cperf load_a verify_a; do
  g++ -O3 -DNDEBUG -std=c++20 -pthread "harness/$name.cpp" -o "bin/$name"
done
./bin/workload --self-test
```

本轮短窗口实际由 `formal-case.py` 执行：A 使用 `workload`，C 使用 `workload-cperf`；后者采用上文说明的计时校验抽样，保持数据和请求口径。`clean_b_suite_lib.py` 记录装载、前后校验、重复测量与 TTL 对齐的顺序；`churn-case.py` 是 B 的正式计时入口。`snapshot.py` 采集 cgroup/HugeTLB 内存。

这些是**记录的执行脚本，不是通用云部署工具**：其中 `/opt/gaming-main-20261111`、私网地址、systemd 单元及设备配置路径是原环境参数，移植时需替换；`clean_b_suite_lib.py` 的 `common` 是远程调度适配层，本目录不发布 SSH 身份或授权管理代码。使用其流程时应接入自己的 SSH/本地执行适配器。不要在业务数据上运行含 FLUSHDB 的流程。

正式短窗口命令参数可从 `raw/load-results.tar.gz` 中各窗口的 `result.json.args` 原样读取。示意：

```sh
./bin/workload --host SERVER_IP --workload A --phase run \
  --keys 10 --members 10000000 --connections 320 --threads 32 \
  --seconds 60 --hot-percent 5 --seed 1108 --out result.json
./bin/workload-cperf --host SERVER_IP --workload C --phase run \
  --keys 10000000 --members 10000000 --connections 320 --threads 32 \
  --seconds 60 --hot-percent 5 --seed 1108 --out result.json
```

示意命令只负责已装载数据的一个窗口；完整复现还要执行上述装载、预热、三轮、前后验证和计数核对。服务端启动例保存在 `harness/start-product.sh`，省略 SPDK 完成上限参数，使用固定 main 的默认值 0。

## 文件与核验

- `data/gaming/points/`：20 GB C 及 A/B 对照；`data/c200/points/`：200 GB C。
- 相应 `memory/`：装载后和测试后快照。`data/lavik-init/`：本轮装载和前后全量校验回执。
- `raw/`：仅本轮 Lavik A/B/C 的初始化、正式窗口和服务端日志；不含此前诊断数据或备份。四个竞品保留所选窗口回执、配置及内存证据，未在本目录重打包其整个历史日志。
- `provenance/`：构建身份、默认参数实际值、完成/归档核验回执与各数据库 INFO。
- `SHA256SUMS`：本目录所有交付文件的 SHA-256（清单自身除外）。执行 `sha256sum -c SHA256SUMS` 可验证下载后的完整性。
