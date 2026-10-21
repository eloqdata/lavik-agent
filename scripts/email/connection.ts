import { readFileSync } from "node:fs";
export function localConnection() {
  const text = readFileSync(".neon", "utf8");
  const match = text.match(/postgres(?:ql)?:\/\/[^\s'"`]+/);
  if (!match) throw new Error("No PostgreSQL connection URL found in .neon");
  const url = new URL(match[0]);
  if (!url.hostname.endsWith(".neon.tech") || !url.password)
    throw new Error("Expected an authenticated Neon connection URL");
  return url.href;
}
