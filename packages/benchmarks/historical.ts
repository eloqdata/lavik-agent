import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const root = "evidence/benchmarks/0.1.0";
const directories: Record<string, string> = {
  "2vcpu-capacity": "lavik-v0.1.0-2vcpu-latest-capacity-2026-10-13",
  "redis-valkey": "lavik-v0.1.0-spdk-vs-latest-2026-10-13",
  "1tb-storage": "lavik-v0.1.0-storage-peers-1tb-2026-10-14",
  "aerospike-ycsb": "lavik-v0.1.0-aerospike-ycsb-2026-10-13",
};
const inventory = JSON.parse(
  fs.readFileSync(`${root}/sources.json`, "utf8"),
) as { files: { path: string; sha256: string; bytes: number }[] };
export const historicalAssets = () =>
  Object.entries(directories).flatMap(([report, directory]) =>
    inventory.files
      .filter((f) => path.dirname(f.path) === `${root}/${directory}`)
      .map((f) => ({ report, file: path.basename(f.path) })),
  );
export function historicalAsset(report: string, file: string) {
  const entry = inventory.files.find(
    (f) => f.path === `${root}/${directories[report]}/${file}`,
  );
  if (!entry) return undefined;
  const bytes = fs.readFileSync(entry.path);
  if (
    bytes.length !== entry.bytes ||
    createHash("sha256").update(bytes).digest("hex") !== entry.sha256
  )
    throw new Error("Historical benchmark asset changed");
  return bytes;
}
