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
const systemIds: Partial<Record<ProductId, string>> = {
  redis: "redis",
  valkey: "valkey",
  dragonfly: "dragonfly",
  garnet: "garnet",
};
const historicalNames: Partial<Record<ProductId, string>> = {
  pika: "Pika",
  kvrocks: "Apache Kvrocks",
  tendis: "Tendis",
  keydb: "KeyDB On Flash",
};
export function comparisonMeasurements(product: ComparisonProduct): {
  lavik: Measurement[];
  peer: Measurement[];
} {
  if (product.group !== "historical") {
    const lines = fs
      .readFileSync(comparisonSource("beta-results").path, "utf8")
      .trim()
      .split(/\r?\n/);
    const headers = lines.shift()!.split(",");
    const rows = lines
      .map((line) =>
        Object.fromEntries(line.split(",").map((v, i) => [headers[i], v])),
      )
      .filter(
        (r) =>
          r.group === product.group &&
          ["lavik-spdk", systemIds[product.id]].includes(r.system),
      );
    const convert = (system: string) =>
      rows
        .filter((r) => r.system === system)
        .map((r) => {
          if (
            Number(r.connection_errors) !== 0 ||
            !["GET", "SET"].includes(r.workload) ||
            Number(r.value_bytes) !== 1024 ||
            Number(r.keys) !== (product.group === "memory" ? 1e7 : 1e9) ||
            Number(r.test_seconds) !== (product.group === "memory" ? 30 : 60)
          )
            throw new Error("Benchmark scope changed");
          return {
            system,
            workload: r.workload as "GET" | "SET",
            qps: Number(r.qps),
            p99: Number(r.p99_ms),
            p999: Number(r.p999_ms),
            connections: Number(r.connections),
            threads: Number(r.server_threads),
          };
        });
    return validate({
      lavik: convert("lavik-spdk"),
      peer: convert(systemIds[product.id]!),
    });
  }
  const report = fs.readFileSync(
    comparisonSource("tiering-report").path,
    "utf8",
  );
  const convert = (name: string) =>
    report
      .split(/\r?\n/)
      .filter((line) => line.startsWith("| "))
      .flatMap((line) => {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((s) => s.trim());
        const workloads: Record<string, Measurement["workload"]> = {
          "Read-only GET": "GET",
          "Write-only SET": "SET",
          "1:1 read/write": "MIX",
        };
        if (cells[1] !== name || !workloads[cells[0]] || cells.length !== 5)
          return [];
        return [
          {
            system: name,
            workload: workloads[cells[0]],
            qps: Number(cells[2].replaceAll(",", "")),
            p99: Number(cells[3]),
            p999: Number(cells[4]),
            connections: 80,
          },
        ];
      });
  return validate({
    lavik: convert("Lavik SPDK"),
    peer: convert(historicalNames[product.id]!),
  });
}
function validate(data: { lavik: Measurement[]; peer: Measurement[] }) {
  for (const rows of [data.lavik, data.peer]) {
    if (
      !rows.some((r) => r.workload === "GET") ||
      !rows.some((r) => r.workload === "SET") ||
      rows.some((r) =>
        [r.qps, r.p99, r.p999, r.connections].some(
          (n) => !Number.isFinite(n) || n <= 0,
        ),
      )
    )
      throw new Error("Incomplete or invalid comparison data");
  }
  return data;
}
