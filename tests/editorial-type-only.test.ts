import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import ts from "typescript";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

test("editorial CI typing correction preserves the independently reviewed runtime", () => {
  const correction = read(
    "evidence/editorial/type-only-correction-20261014.json",
  );
  const audit = read(correction.reviewRecord);
  const current = fs.readFileSync(correction.file, "utf8");
  assert.equal(current.split(correction.annotation).length, 2);
  const original = current.replace(correction.annotation, "");
  assert.equal(hash(original), correction.reviewedSha256);
  assert.equal(hash(original), audit.reviewedFiles[correction.file]);
  assert.equal(hash(current), correction.correctedSha256);
  const emit = (text: string) =>
    ts.transpileModule(text, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
  assert.equal(emit(current), emit(original));

  const websiteCorrections = read(
    "evidence/editorial/website-ci-corrections-20261014.json",
  );
  assert.deepEqual(
    websiteCorrections.changes.map((change: any) => change.file),
    ["apps/web/components/comparisons.tsx", "tests/browser/site.spec.ts"],
  );
  for (const change of websiteCorrections.changes) {
    const text = fs.readFileSync(change.file, "utf8");
    assert.equal(hash(text), change.currentSha256);
    let previous = text;
    for (const replacement of change.replacements) {
      assert.equal(
        previous.split(replacement.after).length,
        replacement.count + 1,
      );
      previous = previous.replaceAll(replacement.after, replacement.before);
    }
    assert.equal(hash(previous), change.originalSha256);
    assert.equal(hash(previous), audit.reviewedFiles[change.file]);
  }
  for (const name of ["comparisons", "benchmarks"]) {
    const before = correction.originalPublications[name];
    const after = read(`evidence/${name}/publication.json`);
    assert.deepEqual(after.reviewer, before.reviewer);
    assert.equal(after.reviewSha256, before.reviewSha256);
    assert.equal(
      before.reviewedFiles[correction.file],
      correction.reviewedSha256,
    );
    const expected = {
      ...before.reviewedFiles,
      [correction.file]: correction.correctedSha256,
    };
    for (const change of websiteCorrections.changes)
      if (change.file in expected) expected[change.file] = change.currentSha256;
    assert.deepEqual(after.reviewedFiles, expected);
  }
});
