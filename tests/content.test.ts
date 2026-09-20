import test from "node:test";
import assert from "node:assert/strict";
import {
  articles,
  contentHash,
  recipeHash,
  release,
} from "../packages/content/repository.ts";
import {
  checkReceipt,
  publicationErrors,
  storedReceipt,
  validateArticle,
} from "../packages/content/gate.ts";
import {
  benchmarkRows,
  currentBenchmark,
} from "../packages/content/benchmarks.ts";
import { estimateCost } from "../packages/content/economics.ts";

test("every initial edition has current review and execution evidence", () => {
  for (const article of articles())
    assert.deepEqual(publicationErrors(article), [], article.id);
});
test("changed prose invalidates the exact reviewed artifact", () => {
  const article = structuredClone(articles()[0]);
  const original = contentHash(article);
  article.title += " modified";
  assert.notEqual(contentHash(article), original);
  assert.ok(
    publicationErrors(article).some((error) =>
      error.includes("content change"),
    ),
  );
});
test("unverified cost claim and invented customer adoption fail", () => {
  const article = structuredClone(articles()[0]);
  article.blocks = [{ type: "claim", claimId: "cost-hypothesis" }];
  assert.ok(
    validateArticle(article).some((e) => e.includes("Unsupported claim")),
  );
  article.blocks = [
    {
      type: "paragraph",
      text: "Trusted by our customers in production",
      sources: ["readme"],
    },
  ];
  assert.ok(validateArticle(article).some((e) => e.includes("adoption")));
});
test("conditional calculated economics are permitted", () => {
  const article = structuredClone(articles()[0]);
  article.blocks = [
    {
      type: "paragraph",
      text: "At an assumed 20x unit-price ratio, SSD value capacity costs 95% less before other costs.",
      sources: ["tiering-cost"],
    },
    { type: "calculation", calculationId: "capacity-economics" },
  ];
  assert.deepEqual(validateArticle(article), []);
});
test("a historical benchmark number requires its methodology", () => {
  const article = structuredClone(articles()[0]);
  article.blocks = [{ type: "claim", claimId: "benchmark-get" }];
  assert.ok(validateArticle(article).some((e) => e.includes("methodology")));
});
test("failed, unavailable and stale command evidence cannot publish", () => {
  const receipt = storedReceipt("basic-commands");
  assert.deepEqual(checkReceipt(receipt, "basic-commands"), []);
  for (const status of ["failed", "unavailable"] as const)
    assert.ok(checkReceipt({ ...receipt, status }, "basic-commands").length);
  assert.ok(
    checkReceipt({ ...receipt, sourceCommit: "wrong" }, "basic-commands").some(
      (e) => e.includes("release mismatch"),
    ),
  );
  assert.ok(
    checkReceipt({ ...receipt, recipeHash: "old" }, "basic-commands").some(
      (e) => e.includes("recipe changed"),
    ),
  );
  assert.ok(
    checkReceipt({ ...receipt, harnessHash: "old" }, "basic-commands").some(
      (e) => e.includes("environment changed"),
    ),
  );
  assert.ok(
    checkReceipt(
      { ...receipt, artifactSha256: "other" },
      "basic-commands",
    ).some((e) => e.includes("binary")),
  );
  assert.throws(() => recipeHash("../../etc/passwd"));
});
test("displayed SPDK benchmark peaks and paired latencies match the current README", () => {
  const rows = benchmarkRows();
  assert.deepEqual(rows, [
    {
      name: "Lavik 0.1.0 SPDK",
      get: 1012180,
      getP99: 3.599,
      set: 930465,
      setP99: 4.799,
    },
    {
      name: "Redis 8.8.0",
      get: 976801,
      getP99: 4.671,
      set: 910426,
      setP99: 4.831,
    },
    {
      name: "Valkey 9.1.0",
      get: 965697,
      getP99: 4.543,
      set: 802519,
      setP99: 4.383,
    },
  ]);
  assert.equal(currentBenchmark.commit, release.commit);
});
test("20:1 component prices imply 95% savings only for that component", () => {
  const input = {
    dramPerGiB: 20,
    ssdPerGiB: 1,
    datasetGiB: 1,
    indexFraction: 0,
    storageAmplification: 1,
    sharedCost: 0,
  };
  assert.equal(estimateCost(input).ratio, 20);
  assert.equal(estimateCost(input).savingsPercent, 95);
  const full = estimateCost({ ...input, indexFraction: 0.02, sharedCost: 2 });
  assert.ok(full.ratio < 20);
  assert.equal(full.lavik, 3.4);
  assert.equal(full.redis, 22);
  assert.throws(() => estimateCost({ ...input, ssdPerGiB: 0 }));
  assert.throws(() => estimateCost({ ...input, datasetGiB: Number.NaN }));
});
