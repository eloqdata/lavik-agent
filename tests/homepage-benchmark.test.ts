import test from "node:test";
import assert from "node:assert/strict";
import {
  homepageBenchmark,
  homepageBenchmarkRows,
} from "../packages/benchmarks/homepage.ts";
import { benchmarkReports } from "../packages/benchmarks/catalog.ts";
import { sourceFile } from "../packages/benchmarks/repository.ts";

test("homepage preserves reported Lavik precision and marks chart-derived peers as approximations", () => {
  const report = benchmarkReports.find((r) => r.id === "redis-valkey")!;
  const readme = sourceFile(report, "README.md").data.toString();
  const svg = sourceFile(report, "combined.svg").data.toString();
  const lavik = homepageBenchmarkRows[0];
  assert.ok(readme.includes((lavik.get / 1000).toFixed(1) + "k QPS"));
  assert.ok(readme.includes((lavik.set / 1000).toFixed(1) + "k QPS"));
  assert.ok(readme.includes(lavik.getP999 + " ms"));
  assert.ok(readme.includes(lavik.setP999 + " ms"));
  assert.equal(lavik.approximate, false);
  // Calibration comes from labeled horizontal grid lines, not the text baseline.
  assert.match(svg, /M 74\.88 416\.16 L 541\.44 416\.16/);
  assert.match(svg, /M 74\.88 375\.36 L 541\.44 375\.36/);
  assert.match(svg, />200k<\/text>/);
  assert.match(svg, />2<\/text>/);
  const points = (id: string) => {
    const group = svg.split('<g id="' + id + '">')[1];
    assert.ok(group, id);
    const path = group.match(/<path d="([^"]+)"/)![1];
    return [...path.matchAll(/[ML] ([\d.]+) ([\d.]+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
  };
  for (const [i, ids] of [
    [1, [22, 45]],
    [2, [23, 46]],
  ] as const) {
    const row = homepageBenchmarkRows[i];
    assert.ok(row.approximate);
    for (const [op, id] of [
      ["get", ids[0]],
      ["set", ids[1]],
    ] as const) {
      const curve = points("line2d_" + id);
      const peak = curve.reduce(
        (best, p, index) => (p.y < curve[best].y ? index : best),
        0,
      );
      assert.equal(peak, 4); // 1,280 connections, same index for tail latency.
      const qps = ((416.16 - curve[peak].y) / 40.8) * 200000;
      assert.equal(row[op], Math.round(qps / 1000) * 1000);
      const tail = points("latency_line2d_" + id)[peak];
      assert.equal(tail.x, curve[peak].x);
      const p999 = ((416.16 - tail.y) / 40.8) * 2;
      assert.equal(
        row[op === "get" ? "getP999" : "setP999"],
        Math.round(p999 * 10) / 10,
      );
    }
  }
  assert.equal(homepageBenchmark.date, "2026-10-13");
  assert.match(
    homepageBenchmark.sourceUrl,
    /lavik-v0\.1\.0-spdk-vs-latest-2026-10-13/,
  );
});
