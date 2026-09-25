import test from "node:test";
import assert from "node:assert/strict";
import {
  quickStartEvidenceErrors,
  quickStartReport,
} from "../packages/quick-start/evidence.ts";
import { quickStartPackages } from "../packages/quick-start/content.ts";

test("quick start proves all four installers and both native package runtimes without PATH setup", () => {
  assert.deepEqual(quickStartEvidenceErrors(), []);
  const report = quickStartReport();
  assert.equal(report.packages.length, 4);
  assert.equal(report.packages.filter((p: any) => p.runtime).length, 2);
  for (const pkg of quickStartPackages) {
    assert.match(
      pkg.commands,
      new RegExp(`cd ${pkg.directory} &&\\n\\./lavik --version$`),
    );
    assert.ok(pkg.commands.includes(`sha256sum -c ${pkg.filename}.sha256 &&`));
  }
});
test("quick-start publication rejects missing, stale or PATH-masked runtime evidence", () => {
  for (const mutate of [
    (r: any) => {
      r.packages.pop();
    },
    (r: any) => {
      r.packages[0].commands += "\necho untested";
    },
    (r: any) => {
      r.packages[0].sha256 = "0".repeat(64);
    },
    (r: any) => {
      r.packages[0].executableOnPath = true;
    },
    (r: any) => {
      r.packages.find((p: any) => p.runtime).runtime.gracefulRestart = "failed";
    },
    (r: any) => {
      r.packages.find((p: any) => p.runtime).runtime.steps[0].actual = "WRONG";
    },
    (r: any) => {
      r.packages.find((p: any) => p.runtime).runtime.executableOnPath = true;
    },
    (r: any) => {
      r.harnessHash = "stale";
    },
    (r: any) => {
      r.fileHashes["verification/start.sh"] = "stale";
    },
    (r: any) => {
      r.dependencies.standard = "unexecuted dependencies";
    },
  ]) {
    const report = structuredClone(quickStartReport());
    mutate(report);
    assert.ok(quickStartEvidenceErrors(report).length > 0);
  }
});
