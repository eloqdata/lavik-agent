# PR #358 + #357：Lavik 8 KiB 十四项测试

本地目录为 `work/compact-pr357-stack-20261019`；服务端运行目录为 `/mnt/dev/benchmark/compact-pr357-stack-20261019`，客户端运行目录为 `/opt/benchmark/compact-pr357-stack-20261019`。

仅测试 Lavik 叠加提交 `d0084f4a9a869e38ab91ecef6291a89483940123`：在 #358 的 `001442e89129468d974cef8c30f8b70ad249f80a` 上叠加 #357 的 `48ca16c10680899a81b31a6e6c16c54a2d21a666`。Bycorf 为 `86d686724ddd1c5617fb1b62f8131e05571e8423`。`stack-manifest.json` 必须包含真实二进制及构建、源码 manifest SHA；未完成身份不能封包或开始运行。

## 已冻结的客户端

五个客户端源文件、共享头、接口、构建 manifest 和 41 项 Linux 测试记录均按字节复用 `objects8k-fourdb-20261019`。不重编译、不修改随机数、种子、统计或命令语义。实际运行二进制仍位于 `/opt/benchmark/objects8k-fourdb-20261019/clients/`；新结果、state 和观测全部写入本实验目录。`client-reuse-manifest.json` 记录复用来源，启动前核对原路径的二进制 SHA。

顺序为 HGETALL、HKEYS、HVALS、SMEMBERS、LRANGE、ZRANGE WITHSCORES、SET、SETRANGE、HSET、LPUSH/RPOP、ZINCRBY、ZREM/ZADD、XADD MAXLEN、SADD/SREM。每项 8,192 keys、80 连接、16 客户端线程、pipeline 1，预热 90 秒，正式 60 秒，正式期间两端采样 45 秒。load/warm/formal 种子分别为 101/10180/20180。读验证只采样 key 0、4096、8191。

对象逻辑 payload 均为 8 KiB：String 8,192 B；Hash/List/Stream 为 32×256 B；Set/ZSet 为 256×32 B。ZINCRBY 保持 ±32,768，ZREM/ZADD score 保持序列号取模 32,768。成对操作的 OPERATIONS 吞吐与延迟按完整 pair 统计。

## 存储和生命周期

六盘保持当前 VFIO/SPDK 绑定，不重新分区、格式化或灌入旧 1 MiB 数据。首起精确恢复前一实验 `session-candidate-grouped-zswap` 的 checkpoint 8、16,384 entries；`origin-stop.json` 保留原始清停字节，`initial-recovery.json` 固定其 SHA 与来源。

每项执行：start → 精确确认上一 checkpoint 完整恢复 → 本 family 一次 FLUSHDB → 装载本项数据 → 三 key 验证 → warm → 验证 → formal + 观测 → 验证 → SIGTERM 干净停止。每个成功点的 checkpoint 均为 8,192 entries，generation 从 9 连续递增至 22。客户端和服务端独立检查恢复链；defrag 全程开启，不执行 DBSIZE 或 SCAN。

ZREM/ZADD 和 SADD/SREM 每个 family 各自初始化一份全零 state，warm→formal 连续保存；不跨 family 复用。中断通知客户端后允许完整 pair 收尾并保存 state；任何中断点不得作为正式结果。启动丢失 SSH 回包仍只清理本次 label/token 所属进程；身份不明确不停止其他服务。

## 手动运行接口

以下操作由根任务在确认构建结果后执行。封包本身不访问远端：

```sh
python3 finalize.py --check-only
python3 finalize.py
python3 deploy_runtime.py
```

客户端运行入口：

```sh
cd /opt/benchmark/compact-pr357-stack-20261019
sudo python3 suite.py lavik
```

无自动重试。`pause-after-case` 只在当前完整 family 干净停止后暂停；只允许明确手动移除该标记并使用 `suite.py lavik --resume` 继续已清停的前缀。失败或半个 family 不会自动跳过、重做或继续。

服务端调用保持原 ownership 接口：`start lavik session-lavik-<op> <token>`、`reset-data lavik <label> <token>`、`stop-owned lavik <label> <token>`、`snapshot <name>.json`。reset 仅作用于已就绪的当前 family，一次调用。

## 本地采集和分析

```sh
python3 collect.py --dry-run
python3 collect.py
python3 analyze.py --partial
python3 analyze.py
python3 compare_main.py
```

采集只读取本实验目录并制作临时归档，保留之前的本地快照。最终分析要求十四点全部完成、零错误、精确 commandstats/reply 对账、有效观测、状态连续、每项 FLUSHDB 与 checkpoint 恢复/清停完整。`compare_main.py` 将新十四点与现有报告中 main `684894d` 的十四个 8 KiB 点逐项比对，验证客户端二进制相同并保留两次测量的原始身份。历史基线与叠加版本是独立测量，不能把所有差异单独归因于 #357。
