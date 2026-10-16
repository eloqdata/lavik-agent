# Lavik main：1 MiB 大对象读写测试

测试版本：[main `07e0f2ac`](https://github.com/eloqdata/lavik/commit/07e0f2ac656b62f0f9091f44c6a68d89b40b9934)，测量日期 2026-10-15～16。服务端 Azure Standard_L16aos_v4，客户端 Standard_F32als_v6。

每项 **8,192 keys × 约 1 MiB 有效载荷、80 连接、16 个客户端线程**；预热 90 秒，正式测量 60 秒，各一轮。Lavik defrag 开启。

本目录包含 **11 项 Lavik main 正式结果**（7 项原有写入、3 项整读、1 项 Set 添加/删除），以及补充测试新测的 12 项 Redis/Valkey/Kvrocks 结果，共 23 个正式点，全部零错误。原 [0.1.0 大对象结果](../lavik-v0.1.0-large-objects-2026-10-14) 单独保留。

## Main 结果

| 操作 | 吞吐量 | 平均 ms | p99 ms | p99.9 ms |
|---|---:|---:|---:|---:|
| [SET 1 MiB](main-large-objects-c80-20261015/client/results/pr/set/r1/c80.json) | 2,250 ops/s | 35.285 | 224.070 | 342.045 |
| [SETRANGE 256 B](main-large-objects-c80-20261015/client/results/pr/setrange/r1/c80.json) | 59,441 ops/s | 1.345 | 9.346 | 14.832 |
| [HSET 256 B](main-large-objects-c80-20261015/client/results/pr/hash/r1/c80.json) | 82,100 ops/s | 0.973 | 8.750 | 11.593 |
| [LPUSH / RPOP](main-large-objects-c80-20261015/client/results/pr/list/r1/c80.json) | 84,510 pairs/s | 0.946 | 8.782 | 17.003 |
| [ZINCRBY](main-large-objects-c80-20261015/client/results/pr/zincr/r1/c80.json) | 24,230 ops/s | 3.300 | 21.786 | 31.801 |
| [ZREM / ZADD](main-large-objects-c80-20261015/client/results/pr/zswap/r1/c80.json) | 18,964 pairs/s | 4.217 | 27.041 | 38.253 |
| [XADD MAXLEN](main-large-objects-c80-20261015/client/results/pr/stream/r1/c80.json) | 58,598 ops/s | 1.364 | 9.631 | 18.876 |
| [HGETALL](main-large-reads-set-c80-20261016/client/results/pr/hgetall/r1/c80.json) | 2,631 ops/s | 30.391 | 43.196 | 55.007 |
| [ZRANGE 0 -1 WITHSCORES](main-large-reads-set-c80-20261016/client/results/pr/zrange/r1/c80.json) | 913 ops/s | 87.549 | 203.906 | 242.803 |
| [SADD / SREM](main-large-reads-set-c80-20261016/client/results/pr/sswap/r1/c80.json) | 45,071 pairs/s | 1.774 | 14.213 | 19.633 |
| [SMEMBERS](main-large-reads-set-c80-20261016/client/results/pr/smembers/r1/c80.json) | 973 ops/s | 82.051 | 743.359 | 816.342 |

LPUSH/RPOP、ZREM/ZADD、SADD/SREM 按完整顺序操作对统计。每条命令各自的延迟也保存在对应 JSON 中。Set 添加/删除在每个 key 的 80 个固定槽位内切换，配对结束后保持成员数量不变。

## 报告和原始结果

- [七项写入报告](main-large-objects-c80-20261015/README.zh-CN.md)：main 新测一轮；Redis/Valkey/Kvrocks 对照来自原报告的三轮中位数。
- [整读与 Set 写入报告](main-large-reads-set-c80-20261016/README.zh-CN.md)：四个系统各四项，均为本次新测一轮。
- [23 个正式点汇总](formal-points.json)：包含操作对和各组成命令的完整统计，以及原始文件路径。
- 每个测试目录的 `client/results/<system>/<op>/r1/` 包含正式结果、装载、预热、运行命令和验证记录；`server/` 包含启动命令、配置、日志及快照。`pr` 是框架内部标签，实际测试版本为上述 main。
- `main-source-identity.json` 记录 main 与所用构建的源码树等价性；`verification.json` 记录校验结果。客户端源码保存在各目录的 `client/bench.cpp`。
- [来源和归档范围](SOURCE.json)、[文件 SHA-256](SHA256SUMS)。在本目录运行 `shasum -a 256 -c SHA256SUMS` 可核对文件。

1 MiB 指有效载荷，不含字段名、score、协议和索引等开销。整读包含完整回复校验，可能受客户端或网络限制；不同类型的返回字节数不同。单轮结果用于观察性能差距。
