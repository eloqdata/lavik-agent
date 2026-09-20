import { sourceText } from "./repository.ts";

export const currentBenchmark = {
  sourceId: "benchmark-spdk",
  dataSourceId: "benchmark-spdk-data",
  date: "2026-09-18",
  release: "v0.1.0-beta.1",
  commit: "3955b98d43b312324aa8d52775df52cfb111c0d0",
  scope: {
    en: "AMD EPYC 9V74 server, approximately 126 GiB RAM, six NVMe drives, 10 million 1 KiB values, pipeline=1, and 30-second measurement windows. Lavik uses the beta release with SPDK and kernel TCP. Redis and Valkey controls reuse an earlier sweep on the same hosts, with persistence disabled. Each point was measured once; these results do not establish equivalent crash durability or an application SLA.",
    "zh-CN":
      "AMD EPYC 9V74 服务器、约 126 GiB 内存、六块 NVMe 盘、1,000 万个 1 KiB 值、pipeline=1，以及每个测量点 30 秒的测试窗口。Lavik 使用 beta 发布包、SPDK 存储和内核 TCP。Redis 与 Valkey 对照数据复用同一组主机上的较早测试，且关闭了持久化。每个点仅测量一次；这些结果不能证明相同的崩溃持久性或应用 SLA。",
  },
};

export function benchmarkRows() {
  const lines = sourceText(currentBenchmark.dataSourceId).trim().split("\n");
  const columns = lines[0].split(",");
  const data = lines
    .slice(1)
    .map((line) =>
      Object.fromEntries(
        line.split(",").map((value, i) => [columns[i], value]),
      ),
    );
  return [
    { product: "Lavik", name: "Lavik 0.1.0 SPDK" },
    { product: "Redis", name: "Redis 8.8.0" },
    { product: "Valkey", name: "Valkey 9.1.0" },
  ].map(({ product, name }) => {
    const best = (workload: string) =>
      data
        .filter(
          (row) =>
            row.group === "memory" &&
            row.product.startsWith(product) &&
            row.workload === workload,
        )
        .sort((a, b) => Number(b.qps) - Number(a.qps))[0];
    const get = best("GET"),
      set = best("SET");
    if (!get || !set) throw new Error(`Missing benchmark rows: ${name}`);
    return {
      name,
      get: Math.round(Number(get.qps)),
      set: Math.round(Number(set.qps)),
      getP99: Number(get.p99_ms),
      setP99: Number(set.p99_ms),
    };
  });
}
