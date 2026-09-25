import assert from "node:assert/strict";
import test from "node:test";
import {
  operationsEvidenceErrors,
  operationsReport,
  operationSnippet,
} from "../packages/operations/repository";

test("operator guides require actual beta.1 executions and a provisioned monitoring stack", () => {
  assert.deepEqual(operationsEvidenceErrors(), []);
  assert.throws(() => operationSnippet("../other"));
});
test("operator publication rejects stale scripts, missing variants, uncompleted failovers and broken monitoring", () => {
  const changes: ((r: any) => void)[] = [
    (r) => (r.release = "nightly"),
    (r) => (r.fileHashes["verification/operations/run.py"] = "stale"),
    (r) => r.packages.pop(),
    (r) => (r.packages[0].sha256 = "wrong"),
    (r) => (r.packages[0].execution.gracefulRestart = "failed"),
    (r) => (r.packages[0].execution.steps = []),
    (r) => {
      const e = r.packages.find(
        (p: any) => p.execution.layout === "ha",
      ).execution;
      e.steps = e.steps.filter(
        (s: any) =>
          s.argv.at(-1) !== "/verification/snippets/restart-follower.sh",
      );
    },
    (r) =>
      (r.packages.find(
        (p: any) => p.execution.layout === "ha",
      ).execution.controlledFailover.stdout = "OK submitted"),
    (r) => {
      const e = r.packages.find(
        (p: any) => p.execution.layout === "ha",
      ).execution;
      e.automaticFailover.status.groups[0].owner_node_id =
        e.automaticFailover.failedNode;
    },
    (r) =>
      (r.packages.find(
        (p: any) => p.execution.layout === "ha",
      ).execution.restartGuardNegatives = []),
    (r) =>
      (r.packages.find(
        (p: any) => p.execution.layout === "ha",
      ).execution.restartGuardNegatives[0].pidLookupReached = true),
    (r) => (r.monitoring.downloadUmask = "022"),
    (r) => (r.monitoring.credentialsMode = "0644"),
    (r) => (r.monitoring.targetRefresh = "passed"),
    (r) => (r.monitoring.targetRefresh[0].generatorExitCode = 1),
    (r) => (r.monitoring.targetRefresh[0].generatorStatus = "running"),
    (r) =>
      (r.monitoring.targetRefresh[0].targets =
        r.monitoring.targetRefresh[1].targets),
    (r) => (r.monitoring.targetRefresh[1].targets = []),
    (r) => (r.monitoring.targets[0].health = "down"),
    (r) => (r.monitoring.dashboard.panels = 0),
    (r) => (r.monitoring.grafanaHealth.version = "latest"),
    (r) => (r.monitoring.upstreamFiles["compose.yaml"] = "changed"),
  ];
  for (const mutate of changes) {
    const report = structuredClone(operationsReport());
    mutate(report);
    assert.ok(operationsEvidenceErrors(report).length > 0);
  }
});
