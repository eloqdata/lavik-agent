import exactData from "./exact-data.json";

export const rawArchiveUrl = (directory: string) =>
  `https://github.com/eloqdata/lavik-agent/tree/${exactData.archiveCommit}/perf_reports/${directory}`;

export const rawMemoryResultsUrl =
  rawArchiveUrl("lavik-v0.1.0-spdk-vs-latest-2026-10-13") +
  "/metadata/results.csv";
