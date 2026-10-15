import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withBenchmarkNumberReviewLock } from "../packages/benchmarks/review-lock.ts";
import { storage80Rows } from "../packages/benchmarks/storage-data.ts";
import { createHash } from "node:crypto";
import exactData from "../packages/benchmarks/exact-data.json";
import { comparisonFileHashes } from "../packages/comparisons/gate.ts";
import { benchmarkFileHashes } from "../packages/benchmarks/gate.ts";

const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

test("all chart inputs bind original archive checksums and operation-specific raw measurements", () => {
  assert.deepEqual(storage80Rows, exactData.storageRows);
  const benchmark = benchmarkFileHashes(),
    comparison = comparisonFileHashes();
  for (const [file, sha] of Object.entries(exactData.sourceFiles)) {
    assert.equal(digest(fs.readFileSync(file)), sha, file);
    assert.equal(benchmark[file], sha);
    assert.equal(comparison[file], sha);
    const parts = file.split("/"),
      root = parts.slice(0, 2).join("/");
    const sums = fs.readFileSync(root + "/SHA256SUMS", "utf8");
    const entry = sums
      .split("\n")
      .find((line) => line.trim().endsWith(parts.slice(2).join("/")));
    assert.equal(entry?.split(/\s+/)[0], sha);
  }
  for (const [rows, keys, connections, seconds] of [
    [exactData.memoryRows, 10_000_000, 1280, 30],
    [exactData.storageRows, 1_000_000_000, 80, 60],
  ] as const) {
    for (const row of rows)
      for (const op of ["get", "set"] as const) {
        const raw = read(row[op === "get" ? "getSource" : "setSource"]);
        const cfg = raw.configuration,
          stats = raw["ALL STATS"];
        assert.equal(cfg.key_maximum, keys);
        assert.equal(cfg.clients * cfg.threads, connections);
        assert.equal(cfg.test_time, seconds);
        assert.equal(cfg.pipeline, 1);
        assert.equal(cfg.data_size, 1024);
        assert.equal(stats.Totals["Connection Errors"], 0);
        const measured = stats[op === "get" ? "Gets" : "Sets"];
        assert.equal(row[op], measured["Ops/sec"]);
        assert.equal(
          row[op === "get" ? "getP999" : "setP999"],
          measured["Percentile Latencies"]["p99.90"],
        );
        if (op === "get") assert.equal(measured["Misses/sec"], 0);
      }
  }
});

test("memory peaks select the best measured I/O-thread configuration and retain paired latency", () => {
  const file =
    "perf_reports/lavik-v0.1.0-spdk-vs-latest-2026-10-13/metadata/results.csv";
  const [header, ...lines] = fs
    .readFileSync(file, "utf8")
    .trim()
    .split(/\r?\n/);
  const keys = header.split(",");
  const points = lines.map((line) =>
    Object.fromEntries(line.split(",").map((value, i) => [keys[i], value])),
  );
  assert.equal(points.length, 120);
  for (const [i, system] of ["lavik-spdk", "redis", "valkey"].entries()) {
    for (const op of ["get", "set"] as const) {
      const best = points
        .filter(
          (p) =>
            p.group === "memory" &&
            p.system === system &&
            p.workload === op.toUpperCase(),
        )
        .sort((a, b) => Number(b.qps) - Number(a.qps))[0];
      const row = exactData.memoryRows[i];
      assert.equal(row[op], Number(best.qps));
      assert.equal(
        row[op === "get" ? "getP999" : "setP999"],
        Number(best.p999_ms),
      );
      assert.equal(
        row[op === "get" ? "getThreads" : "setThreads"],
        Number(best.server_threads),
      );
      assert.equal(best.connections, "1280");
    }
  }
});

test("numeric publication locks both bundles before review and later block revokes both", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lavik-numeric-review-"));
  const options = {
    lockDirectory: path.join(root, "lock"),
    publicationDirectory: path.join(root, "comparisons"),
    benchmarkPublicationDirectory: path.join(root, "benchmarks"),
  };
  const publications = [
    options.publicationDirectory,
    options.benchmarkPublicationDirectory,
  ].map((directory) => {
    fs.mkdirSync(directory);
    const file = path.join(directory, "publication.json");
    fs.writeFileSync(file, "prior pass");
    return file;
  });
  let finish!: () => void;
  const barrier = new Promise<void>((resolve) => {
    finish = resolve;
  });
  try {
    const first = withBenchmarkNumberReviewLock(async () => {
      assert.ok(publications.every((file) => !fs.existsSync(file)));
      await barrier;
      for (const file of publications) fs.writeFileSync(file, "reviewed pass");
    }, options);
    let overlappingStarted = false;
    await assert.rejects(
      withBenchmarkNumberReviewLock(async () => {
        overlappingStarted = true;
      }, options),
      /lock exists/i,
    );
    assert.equal(overlappingStarted, false);
    finish();
    await first;
    assert.ok(
      publications.every(
        (file) => fs.readFileSync(file, "utf8") === "reviewed pass",
      ),
    );
    await withBenchmarkNumberReviewLock(async () => {
      assert.ok(publications.every((file) => !fs.existsSync(file)));
      return { decision: "block" };
    }, options);
    assert.ok(publications.every((file) => !fs.existsSync(file)));
  } finally {
    finish();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
