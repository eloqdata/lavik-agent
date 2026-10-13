export type Measurement = {
  system: string;
  workload: "GET" | "SET" | "MIX";
  qps: number;
  p99: number;
  p999: number;
  connections: number;
  threads?: number;
};
export function bestPoint(
  rows: Measurement[],
  workload: Measurement["workload"],
  p99Limit?: number,
) {
  return rows
    .filter(
      (r) =>
        r.workload === workload &&
        (p99Limit === undefined || r.p99 <= p99Limit),
    )
    .sort((a, b) => b.qps - a.qps)[0];
}
