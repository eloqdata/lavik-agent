import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { manualPublicationErrors } from "../packages/manual/gate.ts";
import { useCases } from "../packages/use-cases/content.ts";
import { selectStoragePoint } from "../packages/use-cases/measurements.ts";
import {
  scenarioReport,
  storagePoints,
  historicalRows,
  useCaseEvidenceErrors,
} from "../packages/use-cases/repository.ts";

test("all seven bilingual use cases have successful exact-release Docker evidence", () => {
  assert.deepEqual(useCaseEvidenceErrors(), []);
  assert.equal(useCases.length, 7);
  assert.equal(scenarioReport().scenarios.length, 7);
  assert.equal(storagePoints().length, 36);
  assert.equal(historicalRows().length, 9);
});

test("p99 filtering selects measured capacity within the bound without interpolating", () => {
  const points = storagePoints();
  const get = selectStoragePoint(points, "lavik-spdk", "GET", 1)!;
  assert.deepEqual(
    [get.qps, get.p99, get.connections],
    [792118.98, 0.959, 320],
  );
  assert.equal(selectStoragePoint(points, "dragonfly", "GET", 1), undefined);
  assert.equal(selectStoragePoint(points, "garnet", "GET", 1), undefined);
  assert.equal(selectStoragePoint(points, "lavik-spdk", "GET", 0.3), undefined);
  const bounded = selectStoragePoint(points, "dragonfly", "GET", 5)!;
  assert.deepEqual(
    [bounded.qps, bounded.p99, bounded.connections],
    [376336.98, 3.279, 160],
  );
  const peak = selectStoragePoint(points, "dragonfly", "GET", null)!;
  assert.deepEqual(
    [peak.qps, peak.p99, peak.connections],
    [466038.53, 38.911, 1280],
  );
  assert.equal(
    selectStoragePoint(points, "lavik-spdk", "GET", 0.959)?.qps,
    get.qps,
  );
  const lavikWrite = selectStoragePoint(points, "lavik-spdk", "SET", 2)!;
  const garnetWrite = selectStoragePoint(points, "garnet", "SET", 2)!;
  assert.equal(lavikWrite.qps, 422449.9);
  assert.equal(garnetWrite.qps, 584665.39);
  assert.ok(
    garnetWrite.qps > lavikWrite.qps,
    "preserve competitor advantages within a selected deadline",
  );
});

test("publication rejects altered, failed, missing and stale use-case receipts", (t) => {
  const read = fs.readFileSync.bind(fs);
  let mutate = (receipt: ReturnType<typeof scenarioReport>) => {
    receipt.status = "failed" as "passed";
  };
  t.mock.method(fs, "readFileSync", ((
    file: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) => {
    const result = Reflect.apply(read, fs, [file, ...args]);
    if (!String(file).endsWith("evidence/use-cases/0.1.0/scenarios.json"))
      return result;
    const receipt = JSON.parse(String(result));
    mutate(receipt);
    return JSON.stringify(receipt);
  }) as typeof fs.readFileSync);
  for (const change of [
    mutate,
    (r: ReturnType<typeof scenarioReport>) => {
      r.scenarios.pop();
    },
    (r: ReturnType<typeof scenarioReport>) => {
      r.scenarios[0].steps[0].actual = "incorrect reply";
    },
    (r: ReturnType<typeof scenarioReport>) => {
      r.scenarios[0].steps[0].argv.push("unexecuted");
    },
    (r: ReturnType<typeof scenarioReport>) => {
      r.harnessFiles["verification/use-cases/run.py"] = "0".repeat(64);
    },
    (r: ReturnType<typeof scenarioReport>) => {
      r.sourceCommit = "0".repeat(40);
    },
    (r: ReturnType<typeof scenarioReport>) => {
      r.dockerArgv = r.dockerArgv.filter((a) => a !== "--network=none");
    },
  ]) {
    mutate = change;
    assert.ok(useCaseEvidenceErrors().length > 0);
    assert.ok(
      manualPublicationErrors({ requireReview: false }).some((e) =>
        /Use.case/i.test(e),
      ),
    );
  }
});
