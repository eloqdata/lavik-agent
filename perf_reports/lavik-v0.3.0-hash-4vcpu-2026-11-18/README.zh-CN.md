# 切换 SPDK 前的历史复测结果

> **New diagnosis / 新排查结果:** The slowdown is reproduced with small mixed I/O in fio and standalone SPDK. Same-host Aerospike C/B/C-recovery measurements are complete. See [完整结果与硬件型号 / results and hardware identity](nvme-mixed-io-diagnosis/README.zh-CN.md). Physical SSD failure is not established.

> **Backend correction / 后端更正（2026-11-18）:** All Lavik values and figures below are historical **Minimal / io_uring**, not SPDK. Requested **Standard / SPDK** measurements are incomplete (10M C/B completed; A interrupted; 100M not started). Do not treat these tables as an SPDK comparison. See [fio diagnosis and SPDK evidence / fio 排查与 SPDK 证据](fio-diagnostics/).

已将三个对比系统和Lavik纯读更新为当前机器分配下的数据。每点三次一分钟，128连接、不限速、8×128B、关闭索引、原生部署。Lavik B/A 已复用原数据重测，但 NVMe 延迟仍不稳定，暂不进入主表。详见[调参与作废记录](tuning-retry/)。

### 10M records

| Product | C ops/s | B ops/s | A ops/s |
|---|---:|---:|---:|
| lavik (io_uring) | 361,874 | Tuning pending | Tuning pending |
| redis | 258,913 | 259,192 | 233,519 |
| kvrocks | 85,015 | 77,598 | 34,664 |
| dragonfly | 340,929 | 330,934 | 277,608 |


Lavik纯读361,874 ops/s，比Dragonfly340,929高6.14%。纯读保留默认参数结果，仅B/A继续调参。上次机器释放前排序相反，因此不能把本次优势推广为所有机器分配都成立。

1亿条的 Kvrocks/Dragonfly 已更新为[本次大规模复测](large-peers-repeat/)。Lavik 1亿条仍来自先前机器分配，不将其视为新一轮严格同机对比。详见[英文主报告](README.md)。[当前CSV](metadata/results.csv) · [同机复测原始记录](same-host-repeat/) · [原始结果](metadata/original-results.json)

![吞吐](figures/throughput.svg)
