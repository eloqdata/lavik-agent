import { benchmarkReports } from "./catalog";
import { reportSourceUrl } from "./repository";

import exactData from "./exact-data.json";

// Raw measured QPS and whole-window p99.9; presentation rounds QPS to integers.
export const homepageBenchmarkRows = exactData.memoryRows.map((row) => ({
  ...row,
  approximate: false,
}));
export const homepageBenchmark = {
  date: "2026-10-21",
  sourceUrl: reportSourceUrl(
    benchmarkReports.find((r) => r.id === "redis-valkey")!,
  ),
  scope: {
    en: "Lavik 0.2.0 SPDK vs Redis 8.10.2 and Valkey 9.1.2: 16 vCPUs / 8 physical cores, AMD EPYC 9V74, 128 GiB nominal RAM, six NVMe SSDs, 10 million 1 KiB values, pipeline 1, 30-second windows. Selected peaks use 1,280 connections; Redis uses 16 I/O threads, Valkey GET 16 / SET 8. Latency is p99.9 at the same point. All values come from the archived memtier JSON results. QPS is displayed to the nearest whole operation; p99.9 retains the recorded millisecond precision. Redis/Valkey disable AOF and automatic snapshots. Single-run results do not establish equivalent durability or an application SLA.",
    "zh-CN":
      "Lavik 0.2.0 SPDK 对比 Redis 8.10.2、Valkey 9.1.2：16 vCPU / 8 个物理核，AMD EPYC 9V74、标称 128 GiB 内存、六块 NVMe SSD、1,000 万个 1 KiB 值、pipeline 1、每点 30 秒。所选峰值均为 1,280 个连接；Redis 使用 16 个 I/O 线程，Valkey GET 使用 16 个、SET 使用 8 个。延迟为同一测量点的 p99.9。全部数值来自归档的 memtier JSON 结果。QPS 显示为最接近的整数；p99.9 保留记录中的毫秒精度。Redis/Valkey 关闭 AOF 和自动快照。单次测量不代表相同持久性或应用 SLA。",
  },
};
