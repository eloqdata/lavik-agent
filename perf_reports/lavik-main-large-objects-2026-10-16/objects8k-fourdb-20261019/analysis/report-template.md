## 8 KiB 四库读写对比（2026-10-19）

Lavik main [`684894d`](https://github.com/eloqdata/lavik/commit/684894d973878ca0e0649b54404ce77521f1695f)、Redis 8.10.2、Valkey 9.1.2、Apache Kvrocks 2.17.0。服务器为 Azure Standard_L16aos_v4，客户端为 Standard_F32als_v6。每项独立装载 **8,192 keys × 8 KiB 用户数据**，合计 64 MiB；**80 连接、16 个客户端线程、pipeline 1**，预热 90 秒、正式测量 60 秒，各一轮。

每格为 **吞吐 / Avg ms / p99.9 ms**。LPUSH/RPOP、ZREM/ZADD、SADD/SREM 的吞吐单位为 pairs/s，其余为 QPS。此节对应上述 main 提交；前面的 1 MiB 数据保留其原测量日期和 `9c68079` 身份。

{{TABLE}}

![8 KiB 读命令](objects8k-reads.svg)

![8 KiB 写命令](objects8k-writes.svg)

写命令的 p99.9 跨越三个数量级，右侧使用对数刻度的点图；左侧吞吐仍为线性柱状图。

Kvrocks 的 XADD MAXLEN 在正式窗口内仍继续降速：前 10 秒平均 431.7 QPS，最后 10 秒为 346.1 QPS。表中保留该窗口的汇总值，并非稳定平台值；[逐秒数据](objects8k-fourdb-20261019/client/results/kvrocks-stream-c80/result.json)与其余原始结果一起归档。

### 8 KiB 数据与测量口径

- String 为 8,192 B；Hash/List 为 32 × 256 B；Set/ZSet 为 256 × 32 B；Stream 为 32 条 entry，每条含一个 256 B payload。字段名、score、stream ID 和协议编码不计入用户 payload。
- SET 覆盖整个 String；SETRANGE 随机替换 256 B；HSET 随机替换一个已有字段。LPUSH/RPOP 每对增加并取出一个 256 B 元素。ZINCRBY 随机选择成员并加上 ±32768；ZREM/ZADD 和 SADD/SREM 使用每连接独占的成员槽位。XADD 使用精确 `MAXLEN = 32`。
- 每项使用独立数据和服务进程，装载、预热、正式测量之间保持同一进程。操作对在预热和正式阶段连续保存成员状态；延迟按完整操作对计，两个子命令的指标另存于原始 JSON。
- Redis/Valkey 关闭周期 RDB 和 AOF；Kvrocks 关闭 WAL。各数据库实际配置、启动命令和版本标识保留在归档中。
- 整读延迟包含接收、解析与完整回复校验；HKEYS 只返回字段名，返回的协议字节数与其他整读不同。CPU/NIC 观察窗口为正式阶段中的 45 秒。装载、预热、正式阶段分别使用随机种子 101、10180、20180。
- 本组 ZSet 的 compact 编码为 11,272 B，低于 16 KiB 提升阈值；装载、预热和正式测量均未观察到 grouped 写提交。历史 1 MiB 组使用不同 main 提交和测量条件，尺寸间差异不能单独归因于 grouped 编码。

### 8 KiB 运行与原始数据

归档的运行脚本分别执行 Lavik 和对照库两个阶段；对照库阶段在文件系统准备完成后执行：

```sh
cd /opt/benchmark/objects8k-fourdb-20261019
sudo python3 run.py lavik
sudo python3 run.py peers
```

- [运行接口](objects8k-fourdb-20261019/client/runtime-interface.md)与[客户端接口](objects8k-fourdb-20261019/client/clients/client-interface.md)说明装载、采样和执行顺序。
- [56 个正式点及校验结果](objects8k-fourdb-20261019/comparison.json)；[实际命令和原始结果](objects8k-fourdb-20261019/client/results/)；[服务端配置与日志](objects8k-fourdb-20261019/server/)。
- [客户端源码](objects8k-fourdb-20261019/client/clients/)、[编译身份](objects8k-fourdb-20261019/client/client-build-manifest.json)、[41 项 Linux fake RESP 验证](objects8k-fourdb-20261019/client/linux-client-tests.json)。
- [formal-points.json](formal-points.json) 中的 `objects8k_fourdb` 包含此节 56 个正式点，ID 使用 `产品/8k/命令/c80`；原有 59 个 1 MiB 点及其 20 个 canonical main 点保持独立。
