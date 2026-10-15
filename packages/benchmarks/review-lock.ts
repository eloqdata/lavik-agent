import fs from "node:fs";
import path from "node:path";
import { withComparisonReviewLock } from "../comparisons/review-lock";

export function withBenchmarkNumberReviewLock<T>(
  operation: () => Promise<T>,
  options = {
    lockDirectory: ".runs/local/comparison-publication.lock",
    publicationDirectory: "evidence/comparisons",
    benchmarkPublicationDirectory: "evidence/benchmarks",
  },
): Promise<T> {
  return withComparisonReviewLock(async () => {
    fs.rmSync(
      path.join(options.benchmarkPublicationDirectory, "publication.json"),
      {
        force: true,
      },
    );
    return operation();
  }, options);
}
