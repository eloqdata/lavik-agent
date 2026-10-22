import { homepageBenchmarkRows } from "../benchmarks/homepage";
import exactData from "../benchmarks/exact-data.json";
const storage320Rows = exactData.storageRows;
import fs from "node:fs";
import path from "node:path";
import type { ComparisonProduct, ProductId } from "./catalog";
import type { Measurement } from "./points";
export { bestPoint } from "./points";
export type { Measurement } from "./points";
const directory = path.resolve("evidence/comparisons");
export const comparisonSources = JSON.parse(
  fs.readFileSync(path.join(directory, "sources.json"), "utf8"),
) as {
  checkedAt: string;
  lavikRevision: string;
  sources: {
    id: string;
    path: string;
    url: string;
    sha256: string;
    bytes: number;
  }[];
};
export function comparisonSource(id: string) {
  const source = comparisonSources.sources.find((s) => s.id === id);
  if (!source) throw new Error(`Missing comparison source ${id}`);
  return source;
}
// The current comparison uses October 0.2.0 results only. Storage peers
// share an exact 320-connection point; DRAM peers use their raw 1280-connection peaks.
export function comparisonMeasurements(product: ComparisonProduct): {
  lavik: Measurement[];
  peer: Measurement[];
} {
  if (product.group === "memory") {
    const convert = (
      row: (typeof homepageBenchmarkRows)[number],
    ): Measurement[] =>
      (["GET", "SET"] as const).map((workload) => ({
        system: row.name,
        workload,
        qps: workload === "GET" ? row.get : row.set,
        p999: workload === "GET" ? row.getP999 : row.setP999,
        connections: 1280,
        approximate: row.approximate,
        threads: workload === "GET" ? row.getThreads : row.setThreads,
      }));
    return {
      lavik: convert(homepageBenchmarkRows[0]),
      peer: convert(homepageBenchmarkRows[product.id === "redis" ? 1 : 2]),
    };
  }
  const names: Record<string, string> = {
    dragonfly: "Dragonfly",
    garnet: "Garnet",
    pika: "Pika",
    kvrocks: "Apache Kvrocks",
    tendis: "Tendis",
  };
  const peer = storage320Rows.find((r) =>
    r.name.startsWith(names[product.id]),
  )!;
  const convert = (row: (typeof storage320Rows)[number]): Measurement[] =>
    (["GET", "SET"] as const).map((workload) => ({
      system: row.name,
      workload,
      qps: workload === "GET" ? row.get : row.set,
      p999: workload === "GET" ? row.getP999 : row.setP999,
      connections: 320,
    }));
  return { lavik: convert(storage320Rows[0]), peer: convert(peer) };
}
