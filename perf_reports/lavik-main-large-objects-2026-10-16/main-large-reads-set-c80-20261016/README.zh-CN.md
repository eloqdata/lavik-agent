# 大对象补充：Hash / ZSET / Set 整读及 Set 写入

每种负载 8,192 keys，每 key 约 1 MiB 有效载荷，80 连接，16 客户端线程。四种系统均新增实测一轮，90 秒预热、60 秒正式测量。Lavik 固定 main `07e0f2ac656b62f0f9091f44c6a68d89b40b9934`，与刚测的七项大对象保持同一源码版本。

服务端 Azure Standard_L16aos_v4，客户端 Standard_F32als_v6，两端内核 6.17.0-1022-azure。服务进程限于 CPU 0–15；Lavik 16 个数据 worker，Redis 16 个 I/O 线程，Valkey 8 个 I/O 线程，Kvrocks 16 个 worker。未针对新增的整读负载重新扫描 I/O 线程配置。

## 数据组成与命令

- Hash：4,096 个 field × 256 B，读取 `HGETALL key`，包括 field 名和 value。
- ZSET：32,768 个 32 B member，初始 score 0～32767，读取 `ZRANGE key 0 -1 WITHSCORES`。
- Set：32,768 个 32 B member，读取 `SMEMBERS key`。
- Set 写入：同一个 key 先 SADD 新 member，再 SREM 旧 member；80 条连接各拥有一个槽位，在 a/b 两个成员名之间切换，避免并发冲突。每个 key 仅 80 个槽位被该写入负载修改。操作对结束后保持 32,768 个 member。

1 MiB 不含协议、字段名、score 和元数据；因此各类型整读的实际网络返回字节数不同。对同一命令，四种系统返回相同逻辑数据。

## 吞吐量 / p99.9 ms

每格为 ops/s / p99.9 ms，SADD/SREM 按完整操作对的 pairs/s 和总延迟统计。

| 操作 | Lavik main | Redis | Valkey | Kvrocks |
|---|---:|---:|---:|---:|
| HGETALL | 2,631 / 55.007 | 1,720 / 96.314 | 689 / 302.107 | 2,439 / 57.092 |
| ZRANGE WITHSCORES | 913 / 242.803 | 483 / 332.377 | 282 / 529.133 | 797 / 184.425 |
| SADD/SREM | 45,071 / 19.633 | 151,480 / 1.089 | 273,871 / 0.640 | 82,922 / 2.924 |
| SMEMBERS | 973 / 816.342 | 308 / 728.929 | 215 / 714.128 | 1,318 / 163.870 |

## 本轮观察

Lavik 的 HGETALL、ZRANGE 整读吞吐在这四个系统中最高；HGETALL 的 p99.9 也最低。ZRANGE 的 p99.9 则高于 Kvrocks。Set 写入是明显短板：Lavik 吞吐最低，操作对的 p99.9 也最高。SMEMBERS 的 Lavik p99.9 为 816.342 ms，约为 Kvrocks 的 5 倍；该项值得优先排查。

Lavik SMEMBERS 正式测量前 10 秒约 1,083 ops/s，后 10 秒约 958 ops/s，有下降趋势；预热时 p99.9 已为 742.733 ms。这里只记录现象，尚未定位原因。

## 详细结果

| 系统 | 操作 | 吞吐量 | 平均 ms | p99 ms | p99.9 ms | 客户端平均 CPU 核数 |
|---|---|---:|---:|---:|---:|---:|
| Lavik main 07e0f2ac | HGETALL | 2,631 | 30.391 | 43.196 | 55.007 | 2.86 |
| Lavik main 07e0f2ac | ZRANGE WITHSCORES | 913 | 87.549 | 203.906 | 242.803 | 2.26 |
| Lavik main 07e0f2ac | SADD/SREM | 45,071 | 1.774 | 14.213 | 19.633 | 1.47 |
| Lavik main 07e0f2ac | SMEMBERS | 973 | 82.051 | 743.359 | 816.342 | 1.67 |
| Redis 8.10.2 | HGETALL | 1,720 | 46.495 | 89.838 | 96.314 | 1.67 |
| Redis 8.10.2 | ZRANGE WITHSCORES | 483 | 165.247 | 317.407 | 332.377 | 1.28 |
| Redis 8.10.2 | SADD/SREM | 151,480 | 0.527 | 0.975 | 1.089 | 4.36 |
| Redis 8.10.2 | SMEMBERS | 308 | 259.066 | 496.968 | 728.929 | 0.61 |
| Valkey 9.1.2 | HGETALL | 689 | 116.002 | 164.302 | 302.107 | 1.10 |
| Valkey 9.1.2 | ZRANGE WITHSCORES | 282 | 283.844 | 450.743 | 529.133 | 1.05 |
| Valkey 9.1.2 | SADD/SREM | 273,871 | 0.291 | 0.534 | 0.640 | 7.30 |
| Valkey 9.1.2 | SMEMBERS | 215 | 372.064 | 567.996 | 714.128 | 0.61 |
| Kvrocks 2.17.0 | HGETALL | 2,439 | 32.792 | 52.431 | 57.092 | 4.04 |
| Kvrocks 2.17.0 | ZRANGE WITHSCORES | 797 | 100.334 | 180.668 | 184.425 | 2.63 |
| Kvrocks 2.17.0 | SADD/SREM | 82,922 | 0.964 | 2.550 | 2.924 | 2.53 |
| Kvrocks 2.17.0 | SMEMBERS | 1,318 | 60.658 | 158.201 | 163.870 | 3.16 |

## SADD / SREM 各自延迟

以下命令在同一个操作对内顺序执行，未单独运行纯 SADD 或纯 SREM 负载。

| 系统 | SADD 平均 / p99.9 ms | SREM 平均 / p99.9 ms |
|---|---:|---:|
| Lavik main 07e0f2ac | 1.062 / 12.097 | 0.712 / 10.826 |
| Redis 8.10.2 | 0.263 / 0.584 | 0.263 / 0.584 |
| Valkey 9.1.2 | 0.145 / 0.355 | 0.145 / 0.355 |
| Kvrocks 2.17.0 | 0.485 / 1.630 | 0.478 / 1.619 |

## 校验与边界

三种整读的每个回复都检查数量和重复项；Hash 逐字节核对全部 value，ZSET 核对全部 member、score 和顺序，Set 核对全部成员。该校验计入客户端延迟，四种系统使用同一客户端。解析器按接收进度扫描 RESP2 数组，避免分片回复被反复扫描。

正式点全部零错误。Lavik defrag 开启，Kvrocks 自动 compaction 开启，Redis/Valkey 定期 RDB 与 AOF 关闭。Lavik 使用六盘 SPDK；Kvrocks 使用同六盘 RAID0/XFS。

每项一轮，只代表本轮观测。大回复可能受网络或客户端处理限制，不能将 QPS 单独解释为服务端 CPU 上限。客户端资源使用及两端快照均已保留。

原始结果与每次运行的命令位于 `client/results/<system>/<op>/r1/`；服务参数、配置与日志位于 `server/`。完整版本身份见 `main-source-identity.json`。

前七项测试见 [main 大对象原七项](../main-large-objects-c80-20261015/README.zh-CN.md)。
