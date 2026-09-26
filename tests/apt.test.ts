import test from "node:test";
import assert from "node:assert/strict";
import { readText } from "../packages/content/repository";
import { aptEvidenceErrors, aptManifest } from "../packages/apt/repository";
test("APT publication requires signed package lifecycle evidence and current inputs", () => {
  assert.deepEqual(aptEvidenceErrors(), []);
  assert.equal(
    aptManifest.files.filter((f: any) => f.path.endsWith(".deb")).length,
    4,
  );
  for (const mutate of [
    (r: any) => r.checks.pop(),
    (r: any) => (r.fileHashes = {}),
    (r: any) => (r.fingerprint = "wrong"),
    (r: any) => (r.artifactSha256 = "wrong"),
    (r: any) => (r.sourceCommit = "wrong"),
    (r: any) => (r.architecture = "unknown"),
    (r: any) => (r.imageId = "mutable-tag"),
    (r: any) => (r.status = "failed"),
  ]) {
    const report = JSON.parse(readText("evidence/apt/0.1.0/verification.json"));
    mutate(report);
    assert.ok(aptEvidenceErrors(report).length);
  }
});
