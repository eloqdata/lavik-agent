import { sourceText } from "../content/repository";
import { currentBenchmark } from "../content/benchmarks";

// Tail latency must come from the same measured point as its selected QPS.
export function homepageEvidence() {
  // The frozen CSV covers the 10M-key sweep. Read the 1B result from its
  // separately headed table in the checksum-verified report, not that CSV.
  const storageSection = sourceText(currentBenchmark.sourceId)
    .split("## 1B keys × 1 KiB: storage-tier controls\n")[1]
    ?.split("\n## ")[0];
  const storageGet = storageSection
    ?.split("\n")
    .find((line) => line.startsWith("| GET | Lavik SPDK |"))
    ?.split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  if (!storageGet || storageGet.length !== 10)
    throw new Error("Missing 1B-key homepage benchmark point");
  const billionGet = {
    qps: Number(storageGet[4].replaceAll(",", "")),
    p99: Number(storageGet[7]),
    p9999: Number(storageGet[9]),
    connections: Number(storageGet[3]),
  };
  if (Object.values(billionGet).some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("Invalid 1B-key homepage benchmark point");
  const [header, ...lines] = sourceText(currentBenchmark.dataSourceId)
    .trim()
    .split("\n");
  const columns = header.split(",");
  const rows = lines.map((line) =>
    Object.fromEntries(line.split(",").map((value, i) => [columns[i], value])),
  );
  const peak = (group: string, product: string, workload: string) => {
    const row = rows
      .filter(
        (r) =>
          r.group === group &&
          r.product.startsWith(product) &&
          r.workload === workload,
      )
      .sort((a, b) => Number(b.qps) - Number(a.qps))[0];
    if (!row) throw new Error("Missing homepage benchmark point");
    const result = {
      qps: Math.round(Number(row.qps)),
      p99: Number(row.p99_ms),
      p9999: Number(row.p9999_ms),
      connections: Number(row.connections),
    };
    if (Object.values(result).some((v) => !Number.isFinite(v) || v <= 0))
      throw new Error("Invalid homepage benchmark point");
    return result;
  };
  return {
    billionGet,
    tail: ["GET", "SET"].map((command) => ({
      command,
      lavik: peak("memory", "Lavik", command),
      redis: peak("memory", "Redis", command),
    })),
  };
}
