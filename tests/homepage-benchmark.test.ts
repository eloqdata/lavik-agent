import test from "node:test";
import assert from "node:assert/strict";
import {
  homepageBenchmark,
  homepageBenchmarkRows,
} from "../packages/benchmarks/homepage.ts";
import exactData from "../packages/benchmarks/exact-data.json";

test("homepage uses raw measured peaks and same-point p99.9 without graph estimates", () => {
  assert.deepEqual(
    homepageBenchmarkRows.map((r) => [r.get, r.set, r.getP999, r.setP999]),
    [
      [1145772.35, 971950.32, 7.135, 7.199],
      [1018735.36, 951053.27, 7.103, 7.231],
      [970287.83, 808103.31, 7.455, 7.199],
    ],
  );
  for (const [i, row] of homepageBenchmarkRows.entries()) {
    assert.equal(row.approximate, false);
    assert.equal(row.get, exactData.memoryRows[i].get);
    assert.equal(row.set, exactData.memoryRows[i].set);
  }
  assert.equal(homepageBenchmark.date, "2026-10-13");
  assert.match(
    homepageBenchmark.sourceUrl,
    /lavik-v0\.1\.0-spdk-vs-latest-2026-10-13/,
  );
});
