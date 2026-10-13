import { withComparisonReviewLock } from "../packages/comparisons/review-lock";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  comparisonProducts,
  comparisonRoute,
} from "../packages/comparisons/catalog";
import {
  bestPoint,
  comparisonMeasurements,
} from "../packages/comparisons/measurements";
import {
  capacityEstimate,
  nodeEstimate,
} from "../packages/comparisons/economics";
import {
  beginComparisonReview,
  comparisonFileHashes,
  comparisonPublicationErrors,
  validateComparisonPublication,
} from "../packages/comparisons/gate";
import { pageMetadata, pageStructuredData } from "../packages/seo/site";
import { comparisonFaq } from "../packages/comparisons/content";
const product = (id: string) => comparisonProducts.find((p) => p.id === id)!;
test("comparisons select matching scope and keep competitor latency advantages", () => {
  const redis = comparisonMeasurements(product("redis"));
  assert.equal(Math.round(bestPoint(redis.lavik, "GET")!.qps), 1012180);
  assert.equal(Math.round(bestPoint(redis.peer, "GET")!.qps), 976801);
  assert.equal(bestPoint(redis.lavik, "GET")!.p99, 3.599);
  const valkey = comparisonMeasurements(product("valkey"));
  assert.equal(bestPoint(valkey.peer, "SET")!.threads, 8);
  assert.ok(
    bestPoint(valkey.peer, "SET")!.p99 < bestPoint(valkey.lavik, "SET")!.p99,
  );
  const garnet = comparisonMeasurements(product("garnet"));
  assert.equal(Math.round(bestPoint(garnet.lavik, "GET")!.qps), 952560);
  assert.equal(Math.round(bestPoint(garnet.peer, "SET", 2)!.qps), 584665);
  assert.equal(Math.round(bestPoint(garnet.lavik, "SET", 2)!.qps), 422450);
  const dragonfly = comparisonMeasurements(product("dragonfly"));
  assert.equal(bestPoint(dragonfly.peer, "GET", 1), undefined);
  assert.equal(bestPoint(dragonfly.peer, "GET")!.p99, 38.911);
});
test("historical points come from the matching 200M-key table, including mixed traffic", () => {
  for (const p of comparisonProducts.filter((p) => p.group === "historical")) {
    const { lavik, peer } = comparisonMeasurements(p);
    assert.equal(lavik.length, 3);
    assert.equal(peer.length, 3);
    assert.equal(bestPoint(lavik, "GET")!.qps, 310387.22);
    assert.equal(bestPoint(lavik, "MIX")!.qps, 352442.49);
    assert.ok([...lavik, ...peer].every((r) => r.connections === 80));
  }
  assert.equal(
    bestPoint(comparisonMeasurements(product("keydb")).peer, "GET")!.qps,
    6146.18,
  );
  assert.equal(
    bestPoint(comparisonMeasurements(product("kvrocks")).peer, "SET")!.qps,
    110166.99,
  );
});
test("cost model honors both constraints, replicas, prices, and invalid input", () => {
  const base = {
    dataGiB: 1024,
    usableGiB: 1024,
    targetQps: 1e6,
    observedQps: 952559.72,
    utilization: 0.7,
    copies: 2,
    monthlyNodePrice: 1000,
  };
  assert.deepEqual(nodeEstimate(base), {
    capacityNodes: 1,
    throughputNodes: 2,
    primaries: 2,
    nodes: 4,
    monthly: 4000,
  });
  assert.equal(nodeEstimate({ ...base, observedQps: 466039 }).monthly, 8000);
  assert.equal(nodeEstimate({ ...base, dataGiB: 6000 }).primaries, 6);
  assert.equal(
    nodeEstimate({ ...base, copies: 3, monthlyNodePrice: 500 }).monthly,
    3000,
  );
  for (const changes of [
    { observedQps: 0 },
    { utilization: 1.1 },
    { copies: 1.5 },
    { dataGiB: NaN },
    { monthlyNodePrice: -1 },
    { targetQps: Infinity },
  ])
    assert.throws(() => nodeEstimate({ ...base, ...changes }));
  assert.deepEqual(capacityEstimate(1024, 5, 0.25), {
    dram: 5120,
    ssd: 256,
    ratio: 20,
  });
  assert.throws(() => capacityEstimate(1024, 5, 0));
});
test("comparison approval binds the exact file inventory and reviewer output", () => {
  assert.deepEqual(comparisonPublicationErrors(), []);
  const approval = JSON.parse(
      fs.readFileSync("evidence/comparisons/publication.json", "utf8"),
    ),
    raw = fs.readFileSync("evidence/comparisons/review.json", "utf8"),
    files = comparisonFileHashes();
  assert.ok(
    validateComparisonPublication(
      approval,
      { ...files, "packages/comparisons/content.ts": "0".repeat(64) },
      raw,
    ).length,
  );
  assert.ok(
    validateComparisonPublication(
      approval,
      { ...files, "packages/comparisons/unreviewed.ts": "a".repeat(64) },
      raw,
    ).length,
  );
  assert.ok(validateComparisonPublication(approval, files, raw + " ").length);
  assert.ok(validateComparisonPublication({}, files, raw).length);
});
test("each bilingual comparison has canonical metadata and FAQs identical to visible content", () => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const p of comparisonProducts) {
      const route = comparisonRoute(p.id),
        meta = pageMetadata(locale, route),
        graph = pageStructuredData(locale, route)["@graph"];
      assert.equal(
        meta.alternates?.canonical,
        `https://lavik.dev/${locale}/${route}/`,
      );
      assert.ok(
        String(meta.description).includes(
          p.name === "Apache Kvrocks" ? "Kvrocks" : p.name,
        ),
      );
      const faq = graph.find((g) => g["@type"] === "FAQPage")!;
      assert.deepEqual(
        faq.mainEntity,
        comparisonFaq(p.id, locale).map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer },
        })),
      );
      assert.ok(graph.some((g) => g["@type"] === "Article"));
    }
});

test("a blocked or interrupted re-review cannot reuse an unchanged earlier approval", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "lavik-comparison-review-"),
  );
  try {
    const approval = fs.readFileSync(
      "evidence/comparisons/publication.json",
      "utf8",
    );
    const raw = fs.readFileSync("evidence/comparisons/review.json", "utf8");
    fs.writeFileSync(path.join(directory, "publication.json"), approval);
    fs.writeFileSync(path.join(directory, "review.json"), raw);
    assert.deepEqual(
      validateComparisonPublication(
        JSON.parse(approval),
        comparisonFileHashes(),
        raw,
      ),
      [],
    );
    beginComparisonReview(directory);
    // This is also the state if the model times out or the process exits.
    assert.equal(
      fs.existsSync(path.join(directory, "publication.json")),
      false,
    );
    fs.writeFileSync(
      path.join(directory, "review.json"),
      JSON.stringify({
        decision: "block",
        findings: [
          {
            severity: "blocking",
            file: "content.ts",
            message: "Re-review found a factual error",
          },
        ],
      }),
    );
    assert.equal(
      fs.existsSync(path.join(directory, "publication.json")),
      false,
    );
    assert.ok(
      validateComparisonPublication(
        null,
        comparisonFileHashes(),
        fs.readFileSync(path.join(directory, "review.json"), "utf8"),
      ).length,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("overlapping reviews serialize before revocation, and a later block removes the pass", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lavik-review-race-"));
  const options = {
    lockDirectory: path.join(root, "lock"),
    publicationDirectory: root,
  };
  const file = path.join(root, "publication.json"),
    approved = fs.readFileSync("evidence/comparisons/publication.json", "utf8");
  let continueFirst!: () => void;
  const barrier = new Promise<void>((resolve) => {
    continueFirst = resolve;
  });
  try {
    fs.writeFileSync(file, approved);
    const first = withComparisonReviewLock(async () => {
      await barrier;
      fs.writeFileSync(file, approved);
    }, options);
    let secondStarted = false;
    await assert.rejects(
      withComparisonReviewLock(async () => {
        secondStarted = true;
      }, options),
      /lock exists/i,
    );
    assert.equal(secondStarted, false);
    assert.equal(fs.existsSync(file), false);
    continueFirst();
    await first;
    assert.equal(fs.readFileSync(file, "utf8"), approved);
    await withComparisonReviewLock(async () => {
      assert.equal(fs.existsSync(file), false);
      return { decision: "block" };
    }, options);
    assert.equal(fs.existsSync(file), false);
    fs.writeFileSync(file, approved);
    await assert.rejects(
      withComparisonReviewLock(async () => {
        throw new Error("model interrupted");
      }, options),
      /model interrupted/,
    );
    assert.equal(fs.existsSync(file), false);
  } finally {
    continueFirst();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
