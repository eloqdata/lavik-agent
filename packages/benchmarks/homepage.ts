import { benchmarkReports } from "./catalog";
import { reportSourceUrl } from "./repository";

// Lavik values retain the README's published precision. Peer values are
// approximations from the pinned combined.svg, NOT raw benchmark records.
// Axes: y=416.16 -> 0; y=375.36 -> 200,000 QPS / 2 ms.
// Selected paths: GET line2d_22/23, SET line2d_45/46; latency_ prefix
// identifies corresponding p99.9 paths. All selected peaks are at 1280 connections.
export const homepageBenchmarkRows = [
  {
    name: "Lavik 0.1.0 SPDK",
    get: 1145800,
    set: 972000,
    getP999: 7.135,
    setP999: 7.199,
    approximate: false,
  },
  {
    name: "Redis 8.10.2",
    get: 1019000,
    set: 951000,
    getP999: 7.1,
    setP999: 7.2,
    approximate: true,
  },
  {
    name: "Valkey 9.1.2",
    get: 970000,
    set: 808000,
    getP999: 7.5,
    setP999: 7.2,
    approximate: true,
  },
];
export const homepageBenchmark = {
  date: "2026-10-13",
  sourceUrl: reportSourceUrl(
    benchmarkReports.find((r) => r.id === "redis-valkey")!,
  ),
  scope: {
    en: "Lavik 0.1.0 SPDK vs Redis 8.10.2 and Valkey 9.1.2: 16 vCPUs / 8 physical cores, AMD EPYC 9V74, 125.8 GiB RAM, six NVMe SSDs, 10 million 1 KiB values, pipeline 1, 30-second windows. Selected peaks use 1,280 connections; Redis uses 16 I/O threads, Valkey GET 16 / SET 8. Latency is p99.9 at the same point. Lavik QPS retains the report’s rounded precision; peer values are approximated from the original graph, rounded to 1,000 QPS and 0.1 ms. Redis/Valkey disable AOF and automatic snapshots. Single-run results do not establish equivalent durability or an application SLA.",
    "zh-CN":
      "Lavik 0.1.0 SPDK 对比 Redis 8.10.2、Valkey 9.1.2：16 vCPU / 8 个物理核，AMD EPYC 9V74、125.8 GiB 内存、六块 NVMe SSD、1,000 万个 1 KiB 值、pipeline 1、每点 30 秒。所选峰值均为 1,280 个连接；Redis 使用 16 个 I/O 线程，Valkey GET 使用 16 个、SET 使用 8 个。延迟为同一测量点的 p99.9。Lavik QPS 保留报告的四舍五入精度；对照数值根据原图近似读取，取整至 1,000 QPS 和 0.1 ms。Redis/Valkey 关闭 AOF 和自动快照。单次测量不代表相同持久性或应用 SLA。",
  },
};
