import fs from "node:fs";
import path from "node:path";
import { acquireProcessLock } from "../marketing/process-lock";
import { beginComparisonReview } from "./gate";
// One shared lock across task directories. A competing attempt never starts
// and cannot revoke or replace the active review's approval. Interrupted
// coordinators leave the lock in place for explicit, owner-checked recovery.
export async function withComparisonReviewLock<T>(
  operation: () => Promise<T>,
  options = {
    lockDirectory: ".runs/local/comparison-publication.lock",
    publicationDirectory: "evidence/comparisons",
  },
): Promise<T> {
  fs.mkdirSync(path.dirname(options.lockDirectory), { recursive: true });
  const lock = acquireProcessLock(options.lockDirectory);
  try {
    beginComparisonReview(options.publicationDirectory);
    return await operation();
  } finally {
    lock.release();
  }
}
