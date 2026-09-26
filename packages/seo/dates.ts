import { execFileSync } from "node:child_process";
const cache = new Map<string, string | undefined>();
export function changedAt(file: string) {
  if (cache.has(file)) return cache.get(file);
  let value: string | undefined;
  try {
    if (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        encoding: "utf8",
      }).trim() === "false"
    ) {
      const date = execFileSync(
        "git",
        ["log", "-1", "--format=%cI", "--", file],
        { encoding: "utf8" },
      ).trim();
      if (date && Number.isFinite(Date.parse(date))) value = date;
    }
  } catch {
    /* Omit unavailable history instead of inventing freshness. */
  }
  cache.set(file, value);
  return value;
}
