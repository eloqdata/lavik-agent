import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ClusterIllustration } from "../apps/web/components/cluster-illustration";
import {
  agentCapacity,
  capacityLabel,
  consolidationScenario as sizing,
} from "../packages/homepage/scenarios";
import { homepageEvidence } from "../packages/homepage/evidence";

test("Lavik cube animation is isolated from positioning and stays inside the SVG", () => {
  const html = renderToStaticMarkup(
    createElement(ClusterIllustration, { locale: "en" }),
  );
  const placements = [
    ...html.matchAll(
      /<g transform="translate\((\d+) (\d+)\) scale\((\d+)\)"><use data-node="lavik" href="#home-lavik-cube"><\/use><\/g>/g,
    ),
  ];
  assert.equal(
    placements.length,
    3,
    "each animated cube needs its own positioning group",
  );
  const viewBox = html.match(/viewBox="0 0 (\d+) (\d+)"/)!;
  const [, width, height] = viewBox.map(Number);
  for (const [, x, y, scale] of placements) {
    for (const progress of [0, 0.5, 1]) {
      const animatedScale = 0.65 + 0.35 * progress;
      // Cube geometry spans x=-8..8, y=0..17; animation pivots about (0, 8.5).
      const halfWidth = Number(scale) * 8 * animatedScale;
      const top = Number(y) + Number(scale) * 8.5 * (1 - animatedScale);
      const bottom = Number(y) + Number(scale) * 8.5 * (1 + animatedScale);
      assert.ok(Number(x) - halfWidth >= 0 && Number(x) + halfWidth <= width);
      assert.ok(top >= 0 && bottom <= height);
    }
  }
});

test("300-to-3 illustration preserves aggregate value capacity and requires 100x per-node capacity", () => {
  assert.equal(sizing.redisNodes * sizing.redisValueGiBPerNode, 9600);
  assert.equal(
    sizing.redisNodes * sizing.redisValueGiBPerNode,
    sizing.lavikNodes * sizing.lavikValueGiBPerNode,
  );
  assert.equal(sizing.lavikValueGiBPerNode / sizing.redisValueGiBPerNode, 100);
  assert.equal(capacityLabel(9600 * 2 ** 30), "9.38 TiB");
});
test("agent capacity scales from the stated baseline and rejects invalid inputs", () => {
  const one = agentCapacity(1),
    hundred = agentCapacity(100),
    maximum = agentCapacity(200);
  assert.equal(one.profiles, 1_000_000);
  assert.equal(one.valueBytes, 1_000_000 * 64 * 1024);
  assert.equal(hundred.profiles, 100_000_000);
  assert.equal(hundred.valueBytes / hundred.baselineBytes, 100);
  assert.equal(capacityLabel(one.valueBytes), "61.04 GiB");
  assert.equal(capacityLabel(hundred.valueBytes), "5.96 TiB");
  assert.equal(capacityLabel(maximum.valueBytes), "11.92 TiB");
  assert.equal(maximum.valueBytes / one.valueBytes, 200);
  for (const invalid of [0, -1, 201, 1.5, NaN, Infinity])
    assert.throws(() => agentCapacity(invalid));
});
test("homepage scale and P99.99 facts use the correct groups and selected peak points", () => {
  const { billionGet, tail } = homepageEvidence();
  assert.deepEqual(billionGet, {
    qps: 952560,
    p99: 3.599,
    p9999: 9.791,
    connections: 640,
  });
  assert.deepEqual(
    tail.map((r) => [r.command, r.lavik.p9999, r.redis.p9999]),
    [
      ["GET", 10.239, 17.407],
      ["SET", 17.535, 16.895],
    ],
  );
  assert.deepEqual(
    tail.map((r) => [r.lavik.qps, r.redis.qps]),
    [
      [1012180, 976801],
      [930465, 910426],
    ],
  );
});
