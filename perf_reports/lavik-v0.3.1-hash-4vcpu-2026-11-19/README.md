# Lavik v0.3.1、Redis、Kvrocks、Dragonfly：同机 4 vCPU Hash YCSB 测试

2026-11-19。同一台 Azure L4aos_v5（4 vCPU、32 GiB、约2.88 TB本地NVMe），独立 F16als_v7 客户端。Lavik 使用 SPDK，其余系统以原生进程逐个运行。先通过下文的 fio 准入检查，再执行数据库测试。

128个压测连接，不限速；每点预热60秒，再测3×60秒并取算术平均。每条记录8个字段×128 B，均匀访问，读取和更新全部字段；关闭YCSB扫描索引。Lavik更新使用LAVIK.HREPLACE，其余使用HMSET。不使用DBSIZE或全表扫描核对灌入，采用成功插入数及1003个固定/分散记录校验。

**本次有22个有效测试点、66个一分钟测量窗口（含Lavik两组追加复测）。Dragonfly的1亿条50:50预热返回应用ERR Out of memory，该点没有三轮有效数据，不计算均值。** Redis的1亿条未测试：原始字段值已经达到102.4 GB，超过24 GiB限额，所用配置不支持SSD tiering。

[完整运行参数与实际命令](run-parameters.json) · [详细复现过程](v031-v5-comparison/reproduction.txt) · [HTML报告](v031-v5-comparison/report.html) · [结果CSV](v031-v5-comparison/results.csv) · [完整原始记录与校验](raw/README.md) · [资源释放状态](v031-v5-comparison/cloud-release.json)

## 结果

QPS和p999均为三轮统计值的算术平均；p999不是合并直方图重算。

### 1,000万条

| 读:写 | 系统 | QPS | 读p999（ms） | 写p999（ms） |
|---|---|---:|---:|---:|
| 纯读 | Lavik v0.3.1 | 419,008 | 1.257 | — |
| 纯读 | Redis 8.10.3 | 252,076 | 1.268 | — |
| 纯读 | Kvrocks 2.17.0 | 79,899 | 6.411 | — |
| 纯读 | Dragonfly v2.1 | 353,322 | 1.259 | — |
| 95:5 | Lavik v0.3.1 | 356,828 | 1.366 | 1.252 |
| 95:5 | Redis 8.10.3 | 250,330 | 1.231 | 1.244 |
| 95:5 | Kvrocks 2.17.0 | 78,394 | 9.164 | 9.338 |
| 95:5 | Dragonfly v2.1 | 343,670 | 1.408 | 1.440 |
| 50:50 | Lavik v0.3.1 | 319,858 | 1.637 | 1.575 |
| 50:50 | Redis 8.10.3 | 235,089 | 1.360 | 1.380 |
| 50:50 | Kvrocks 2.17.0 | 34,525 | 23.071 | 23.354 |
| 50:50 | Dragonfly v2.1 | 295,826 | 1.571 | 1.623 |

### 1亿条

| 读:写 | 系统 | QPS | 读p999（ms） | 写p999（ms） |
|---|---|---:|---:|---:|
| 纯读 | Lavik v0.3.1 | 412,610 | 1.183 | — |
| 纯读 | Redis 8.10.3 | 未测试 | — | — |
| 纯读 | Kvrocks 2.17.0 | 23,031 | 17.876 | — |
| 纯读 | Dragonfly v2.1 | 281,818 | 1.869 | — |
| 95:5 | Lavik v0.3.1 | 356,962 | 1.338 | 1.252 |
| 95:5 | Redis 8.10.3 | 未测试 | — | — |
| 95:5 | Kvrocks 2.17.0 | 21,740 | 17.588 | 17.524 |
| 95:5 | Dragonfly v2.1 | 288,999 | 3.536 | 4.428 |
| 50:50 | Lavik v0.3.1 | 348,184 | 1.478 | 1.737 |
| 50:50 | Redis 8.10.3 | 未测试 | — | — |
| 50:50 | Kvrocks 2.17.0 | 14,564 | 29.146 | 29.220 |
| 50:50 | Dragonfly v2.1 | 预热失败 | — | — |

1,000万条基础C/B/A测量中，Lavik相对Dragonfly的吞吐量分别高18.6%、3.8%、8.1%；1亿条的纯读和95:5分别高46.4%、23.5%。这些结论限定于上述并发、数据结构、整条更新及下述配置。

Dragonfly 1亿条50:50在预热约20秒后拒绝写入，used_memory接近24 GiB上限，内核日志没有OOM杀进程记录；并非将该点写成0 QPS。[失败原始诊断](v031-v5-peers/failure-diagnosis.json)。

### Lavik 1,000万条追加测量

基础C/B/A之后继续运行5分钟50:50更新，再分别预热并复测B/A，仍各取3×60秒平均。

| 读:写 | QPS | 读p999（ms） | 写p999（ms） |
|---|---:|---:|---:|
| 95:5 | 322,836 | 1.430 | 1.239 |
| 50:50 | 319,555 | 1.615 | 1.577 |

## 实际配置

- YCSB commit `247a2d448ebceff11a570a622c49ece161a27ed3`；客户端Java17.0.21。
- Lavik v0.3.1官方二进制，4 worker、24 GiB引擎上限，后台参数保持发布默认值，SPDK使用一个NVMe设备。
- Redis8.10.3，4个I/O线程，24 GiB，noeviction，禁用快照/AOF。
- Kvrocks2.17.0，4 worker、8 GiB block cache，其他RocksDB参数见实际bench.conf；灌入后等待compaction pending/running/debt连续三次（10秒间隔）为零。
- Dragonfly v2.1（完整构建SHA见参数文件），4 proactor、24 GiB、cache_mode=false、关闭快照；1亿条使用实验性hash tiering，listpack_max_field_len=256、listpack_max_bytes=2048。
- 各服务CPU0–3。Lavik cgroup26 GiB加2 GiB SPDK hugepages，竞品cgroup28 GiB；禁用swap。实际OS策略为THP=madvise、vm.overcommit_memory=0。

持久化/崩溃恢复保证没有统一为同一种语义；上述配置、全部启动参数、每次YCSB命令和原始记录均保留。没有把其他机器分配上的旧结果拼入本报告。

## 首先用fio检查NVMe

不能只测纯读。执行小块纯随机读、小块随机读叠加5 MiB/s顺序写、4 KiB随机读叠加同样的顺序写，交错重复三遍；每轮5秒预运行加60秒测量。读负载为4 jobs×QD32，CPU0–3、direct io_uring；背景写53,248 B、QD4。

每个混合窗口相对同遍小块纯读IOPS应≥75%，平均读完成延迟<1 ms；所有job无I/O错误，背景写实际达到约5 MiB/s。本次三组平均读IOPS为431,409 / 370,348 / 431,218，九轮通过。

完整的设备身份核验、**清盘前提**、安装与运行命令、实际job文件、输出字段解释及逐轮门槛见[fio筛选流程](v031-v5-fio/README.md)。该检查用于发现本次遇到的混合I/O掉速，不保证全盘、所有长期稳态负载或硬件寿命均正常。初始化会清空指定的专用测试盘，禁止对OS盘执行。

## 原始数据、校验与云资源

运行`python3 restore.py`可以校验分片并恢复完整包到`restored/`。完整包包含Lavik及竞品的客户端/服务端原始归档、fio的九轮原始数据、所有配置和复现脚本。[归档清单](raw/manifest.json)。公开目录另外提供可直接审阅的运行参数和脚本。

成功的测量已独立复算操作数、运行时间、读写比例和三轮均值；运行状态检查核验CPU绑定、内存OOM计数、纯读前后样本、同一NVMe身份与二进制未改变。用户要求上传校验后释放两台测试VM及关联资源，当前执行状态与凭据见[资源状态](v031-v5-comparison/cloud-release.json)。
