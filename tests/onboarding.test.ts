import test from "node:test";
import assert from "node:assert/strict";
import { readText } from "../packages/content/repository";
import {
  dockerImageErrors,
  onboardingErrors,
} from "../packages/docs/repository";
test("onboarding requires actual persistence, complete migration and unchanged instructions", () => {
  assert.deepEqual(onboardingErrors(), []);
  for (const mutate of [
    (r: any) => (r.fileHashes = {}),
    (r: any) => (r.binaryVersion = "lavik nightly"),
    (r: any) => (r.sourceCommit = "wrong"),
    (r: any) => (r.lavikImage = "mutable-tag"),
    (r: any) => r.cases.pop(),
    (r: any) => (r.cases[0].containerReplacement = "failed"),
    (r: any) => (r.cases[1].health = "unhealthy"),
    (r: any) => (r.cases[2].sourceAcksCaughtUp = false),
    (r: any) => r.cases[3].keys.pop(),
    (r: any) => (r.cases[3].targetWritable = false),
  ]) {
    const report = JSON.parse(
      readText("evidence/onboarding/0.1.0/verification.json"),
    );
    mutate(report);
    assert.ok(onboardingErrors(report).length);
  }
});

test("published Docker guides require image identity, replication, failover and recovery evidence", () => {
  assert.deepEqual(dockerImageErrors(), []);
  for (const mutate of [
    (r: any) => (r.fileHashes = {}),
    (r: any) => (r.packagingCommit = "wrong"),
    (r: any) => (r.sourceCommit = "wrong"),
    (r: any) => r.images.pop(),
    (r: any) => (r.images[0].imageId = "mutable-tag"),
    (r: any) => (r.images[1].repoDigests = []),
    (r: any) => (r.images[1].architecture = "unknown"),
    (r: any) => r.checks.pop(),
    (r: any) => (r.stdout = ""),
  ]) {
    const report = JSON.parse(
      readText("evidence/docker-images/0.1.0/verification.json"),
    );
    mutate(report);
    assert.ok(dockerImageErrors(report).length);
  }
});
