# 当前同机复测结果

已将三个对比系统和Lavik纯读更新为当前机器分配下的数据。每点三次一分钟，128连接、不限速、8×128B、关闭索引、原生部署。Lavik B/A正在调defrag参数，暂不展示旧数据作为最新结果。

### 10M records

| Product | C ops/s | B ops/s | A ops/s |
|---|---:|---:|---:|
| lavik | 361,874 | Tuning pending | Tuning pending |
| redis | 258,913 | 259,192 | 233,519 |
| kvrocks | 85,015 | 77,598 | 34,664 |
| dragonfly | 340,929 | 330,934 | 277,608 |


Lavik纯读361,874 ops/s，比Dragonfly340,929高6.14%。纯读保留默认参数结果，仅B/A继续调参。上次机器释放前排序相反，因此不能把本次优势推广为所有机器分配都成立。

1亿条结果保留原始实验数据，详见[英文主报告](README.md)。[当前CSV](metadata/results.csv) · [同机复测原始记录](same-host-repeat/) · [原始结果](metadata/original-results.json)

![吞吐](figures/throughput.svg)
