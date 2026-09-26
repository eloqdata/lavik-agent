import fs from "node:fs/promises";
import { createHash } from "node:crypto";
export async function fullReviewFile(file: string, expectedHash?: string) {
  const text = await fs.readFile(file, "utf8");
  const sha256 = createHash("sha256").update(text).digest("hex");
  if (expectedHash && sha256 !== expectedHash)
    throw new Error(`Review input changed: ${file}`);
  return { file, sha256, text };
}
