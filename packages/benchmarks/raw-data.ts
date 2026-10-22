import exactData from "./exact-data.json";

export const rawArchiveUrl = (directory: string) =>
  `https://github.com/eloqdata/lavik-agent/tree/${exactData.archiveCommit}/perf_reports/${directory}`;

export const rawMemoryResultsUrl =
  rawArchiveUrl(exactData.memoryDirectory) + "/metadata/results.csv";
