export type StoragePoint = {
  system: "lavik-spdk" | "dragonfly" | "garnet";
  workload: "GET" | "SET";
  qps: number;
  p99: number;
  p999: number;
  connections: number;
};
export const storageSystems = [
  { id: "lavik-spdk", name: "Lavik 0.1.0 SPDK" },
  { id: "dragonfly", name: "Dragonfly 1.40.2" },
  { id: "garnet", name: "Garnet 2.1.5" },
] as const;
export function selectStoragePoint(
  points: StoragePoint[],
  system: StoragePoint["system"],
  workload: StoragePoint["workload"],
  limit: number | null,
) {
  return points
    .filter(
      (p) =>
        p.system === system &&
        p.workload === workload &&
        (limit === null || p.p99 <= limit),
    )
    .sort((a, b) => b.qps - a.qps)[0];
}
