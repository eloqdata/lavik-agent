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
      [1156955.76, 945383.88, 7.103, 10.175],
      [976086.75, 863860.02, 7.039, 7.391],
      [913755.76, 793808.71, 7.743, 7.743],
    ],
  );
  for (const [i, row] of homepageBenchmarkRows.entries()) {
    assert.equal(row.approximate, false);
    assert.equal(row.get, exactData.memoryRows[i].get);
    assert.equal(row.set, exactData.memoryRows[i].set);
  }
  assert.equal(homepageBenchmark.date, "2026-10-21");
  assert.match(
    homepageBenchmark.sourceUrl,
    /lavik-v0\.2\.0-vs-memory-databases-2026-10-21/,
  );
});
