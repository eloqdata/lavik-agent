export type Measurement = {
  system: string;
  workload: "GET" | "SET" | "MIX";
  qps: number;
  p999: number;
  connections: number;
  threads?: number;
  approximate?: boolean;
};
export function bestPoint(
  rows: Measurement[],
  workload: Measurement["workload"],
  p999Limit?: number,
) {
  return rows
    .filter(
      (r) =>
        r.workload === workload &&
        (p999Limit === undefined || r.p999 <= p999Limit),
    )
    .sort((a, b) => b.qps - a.qps)[0];
}
