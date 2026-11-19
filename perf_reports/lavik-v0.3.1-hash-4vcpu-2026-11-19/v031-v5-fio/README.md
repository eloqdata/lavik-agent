# Benchmark 前的 NVMe fio 筛选

本次先独立测试 NVMe，再运行数据库。目标是发现“纯读正常，但加入少量写入后随机读吞吐骤降、延迟升高”的分配异常。不要只看纯读峰值或 SMART 是否报错。

这是特定负载的准入检查，不能证明全盘、长期稳态、所有 I/O 模式或硬件寿命都没有问题。若数据库测试后来出现 I/O 异常，应保留记录并重新检查。

## 环境及准备

本次为 Ubuntu 24.04、fio 3.36、Azure L4aos_v5，4 vCPU、32 GiB、一个约 2.88 TB 的本地 NVMe。fio 使用内核 `nvme` 驱动和 `io_uring`，不是 SPDK。测试时停止数据库及其他压测。

**初始化会清空整个选定测试盘。只能使用可丢弃、未挂载、没有分区的专用 NVMe，不能使用 OS 盘或仍需保留的数据盘。**

以下示例沿用本次 `/opt/bench` 目录和 `bench` 账号。先核对实际设备名、PCI 地址、序列号和容量，不要直接假定 `nvme1n1` 就是测试盘。写入区位于 2 TiB，因此设备须大于 2 TiB + 1 GiB。

```bash
sudo apt-get update
sudo apt-get install -y fio nvme-cli sysstat python3
lsblk -b -o NAME,SIZE,MODEL,SERIAL,MOUNTPOINTS
findmnt /
fio --version

# 在当前报告的 v031-v5-fio 目录内执行；适用于新的 /opt/bench 测试目录。
sudo mkdir -p /opt/bench/fio-v5-kit
sudo cp scripts/*.py /opt/bench/fio-v5-kit/

# 先修改成实际核对过的盘符。此步骤只读取并保存身份，不写盘。
sudo python3 /opt/bench/fio-v5-kit/prepare-identity.py \
  --device /dev/nvme1n1 --os-device /dev/nvme0n1
sudo cat /opt/bench/new-host-identity/identity.json

# 确认身份后才执行；此命令会 discard 整块专用测试盘。
sudo python3 /opt/bench/fio-v5-kit/run.py --confirm-discard
sudo cat /opt/bench/fio-screen/complete.json
```

脚本核对序列号、PCI、容量、根文件系统所在设备、分区和挂载情况；输出目录已存在时拒绝覆盖。它先对测试盘执行 `blkdiscard`，再用非零伪随机数据写入 `[1 GiB, 9 GiB)` 的 8 GiB 读区，避免测到未写入虚拟地址的特殊行为。初始化后等待 10 秒。维护 timer 的原状态被保存，测完恢复；实际使用的原版脚本和主机记录在 `qualified-fio/evidence.tgz` 内。

公开复现脚本基于实际运行版本，增加了显式清盘确认、根盘检查和身份生成工具，并将固定容量检查改为身份文件中的容量；下述 fio I/O 配置不变。该脚本不是跨机型一键部署工具，其他机型须重新核验设备几何和环境。

## 九轮测试

按以下顺序交错执行三遍，而不是先连续测完所有纯读再测写入。每轮预运行 5 秒、正式测量 60 秒，总共九轮。

| 项目 | 读负载 | 背景写 |
|---|---|---|
| small-read-only | 随机读，`bssplit=1536/56:2048/44`，`blockalign=512` | 无，额外传 `--readonly` |
| small-read-write | 与上面相同 | 53,248 B 顺序写，5 MiB/s，QD=4 |
| 4k-read-write | 4 KiB 对齐随机读 | 同上 |

共同读参数：`ioengine=io_uring`、`direct=1`、4 个 job、每个 `iodepth=32`、CPU 0–3、`offset=1G`、`size=8G`。背景写独立分组，`offset=2T`、`size=1G`、一个 job、`rate=5M`。只对读区汇总 read IOPS/延迟，不能把背景写 IOPS 加进去。

完整 job 文件：[纯读](small-read-only.fio)、[小块读写](small-read-write.fio)、[4 KiB 读写](4k-read-write.fio)。文件中的盘符来自本次实机；复现时应使用上面的身份校验脚本生成实际 job。

**fio 3.36 在本次配置下报告的实际平均小块读请求约为 1,536 B。** 判断时读取 `io_bytes / total_ios`，不要把配置中的 56:44 直接当作已实现的请求分布。4 KiB 对照也要保留。

## 判定

对每一遍分别比较两个混合点与该遍的 small-read-only 基线：

1. 所有 fio job 的 `error` 必须为 0，读测量时长在 59–62 秒内。
2. 背景写实际速率应接近 5 MiB/s；若没有真正产生写入，此次检查无效。
3. 每个混合点的 read IOPS / 同遍小块纯读 IOPS 必须 ≥ 0.75，且平均读完成延迟 `clat` < 1,000 µs。
4. 同时保存 p999、实际块大小、NVMe SMART、主机资源采样及内核日志。任何 I/O 错误都应先调查。

这里的 75%/1 ms 是本次实验预先设置的筛选门槛，不是 Azure 的性能 SLA。4 KiB 混合点也以同遍小块纯读作为这个筛选门槛的参照；本协议没有单独测 4 KiB 纯读，因此不要把该比值解释成同块大小下的纯读/混合退化率。

## 本次通过筛选的结果

| 项目 | 平均 read IOPS | 平均读 clat（µs） | 读 p999（µs） |
|---|---:|---:|---:|
| small-read-only | 431,409 | 294.935 | 951.637 |
| small-read-write | 370,348 | 344.455 | 552.960 |
| 4k-read-write | 431,218 | 295.531 | 741.376 |

各列都是三轮值的算术平均，p999 不是合并直方图重算。九轮均无 I/O 错误，六个混合窗口全部通过逐轮门槛。详见 [独立复核结果](results.json) 和完整包内的 `qualified-fio/evidence.tgz`。

如果失败，先排除同时运行的数据库、其他 I/O 任务和测试范围/对齐配置问题；保存失败原始结果，不进入数据库正式对照。若更换分配或 redeploy，重新核验设备身份并从头执行筛选，旧分配的数据不能拼进新分配的同机报告。Azure redeploy 会丢失临时盘内容，必须先保存需要的证据。
