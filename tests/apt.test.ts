import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readText } from "../packages/content/repository";
import { aptEvidenceErrors, aptManifest } from "../packages/apt/repository";
test("live APT verification rejects altered public keys, indexes and packages", () => {
  execFileSync("python3", ["tests/verify-apt-live.test.py"], { stdio: "pipe" });
});
test("APT publication requires signed package lifecycle evidence and current inputs", () => {
  assert.deepEqual(aptEvidenceErrors(), []);
  assert.equal(
    aptManifest.files.filter((f: any) => f.path.endsWith(".deb")).length,
    8,
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
