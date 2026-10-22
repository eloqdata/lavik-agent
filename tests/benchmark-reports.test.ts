import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { benchmarkReports } from "../packages/benchmarks/catalog.ts";
import {
  benchmarkSources,
  reportMarkdown,
  reportLink,
  reportSections,
  sourceFile,
  assetUrl,
} from "../packages/benchmarks/repository.ts";
import {
  benchmarkEvidenceErrors,
  benchmarkPublicationErrors,
  benchmarkFileHashes,
  validateBenchmarkPublication,
} from "../packages/benchmarks/gate.ts";
import { storage320Rows } from "../packages/benchmarks/storage-data.ts";
test("reports preserve every published code block and resolve source links to the pinned revision", () => {
  assert.deepEqual(benchmarkEvidenceErrors(), []);
  for (const r of benchmarkReports)
    for (const locale of ["en", "zh-CN"] as const) {
      const raw = sourceFile(
        r,
        locale === "en" ? "README.md" : "README.zh-CN.md",
      ).data.toString();
      const md = reportMarkdown(r, locale),
        fence = String.fromCharCode(96).repeat(3),
        pattern = new RegExp(fence + "[^\\n]*\\n([\\s\\S]*?)" + fence, "g");
      const blocks = (s: string) => [...s.matchAll(pattern)].map((m) => m[1]);
      assert.deepEqual(blocks(md), blocks(raw));
      assert.ok(blocks(raw).length > 0);
      assert.ok(reportSections(r, locale).length >= 4);
      assert.equal(
        reportLink(r, "../../docs/operations/spdk-storage.md", locale),
        "https://github.com/eloqdata/lavik/blob/" +
          benchmarkSources.commit +
          "/docs/operations/spdk-storage.md",
      );
      assert.equal(reportLink(r, "javascript:alert(1)", locale), "");
      assert.equal(reportLink(r, "//untrusted.test", locale), "");
    }
});
test("320-connection numbers retain product/operation pairing from the original ranked chart", () => {
  const r = benchmarkReports.find((r) => r.id === "1tb-storage")!;
  const svg = sourceFile(r, "ranked-320.svg").data.toString();
  const labels = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(
    (m) => m[1],
  );
  for (const op of ["get", "set"] as const) {
    const sorted = [...storage320Rows].sort((a, b) => b[op] - a[op]);
    for (const row of sorted) {
      assert.ok(labels.includes(Math.round(row[op]).toLocaleString("en-US")));
      assert.ok(
        labels.includes(row[op === "get" ? "getP999" : "setP999"].toFixed(3)),
      );
    }
    // SVG's separate QPS and latency rows use the same product ordering.
    const names = sorted.map((r) => r.name),
      qps = sorted.map((r) => Math.round(r[op]).toLocaleString("en-US"));
    const pos = labels.findIndex(
      (v, i) => v === names[0] && names.every((n, j) => labels[i + j] === n),
    );
    // Both halves begin with Lavik/Garnet/Dragonfly; use the full order to locate each.
    assert.ok(pos >= 0);
    assert.deepEqual(labels.slice(pos + 6, pos + 12), qps);
    const start = labels.indexOf("← p99.9 (ms)", pos);
    assert.deepEqual(
      labels.slice(start - 6, start),
      sorted.map((r) => r[op === "get" ? "getP999" : "setP999"].toFixed(3)),
    );
  }
  assert.ok(
    storage320Rows.find((r) => r.name.startsWith("Tendis"))!.setP999 >
      storage320Rows[0].setP999,
  );
  assert.equal(
    reportLink(r, "ranked-320.svg", "en"),
    assetUrl(r, "ranked-320.svg"),
  );
});
test("benchmark approval binds bytes and rejects missing/changed review evidence", () => {
  assert.deepEqual(benchmarkPublicationErrors(), []);
  const record = JSON.parse(
      fs.readFileSync("evidence/benchmarks/publication.json", "utf8"),
    ),
    raw = fs.readFileSync("evidence/benchmarks/review.json", "utf8"),
    files = benchmarkFileHashes();
  assert.ok(
    validateBenchmarkPublication(
      record,
      { ...files, "packages/benchmarks/catalog.ts": "changed" },
      raw,
    ).length,
  );
  for (const file of [
    "apps/web/app/(site)/[locale]/layout.tsx",
    "apps/web/components/use-cases.css",
    "packages/seo/site.ts",
    "scripts/check-content.ts",
  ]) {
    assert.ok(Object.hasOwn(record.reviewedFiles, file), file);
    assert.ok(
      validateBenchmarkPublication(record, { ...files, [file]: "changed" }, raw)
        .length,
      file,
    );
  }
  assert.ok(validateBenchmarkPublication(record, files, raw + " ").length);
  assert.ok(validateBenchmarkPublication({}, files, raw).length);
});
