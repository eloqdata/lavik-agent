import test from "node:test";
import { execFileSync } from "node:child_process";
test("live deployment verification fails stale manifests and changed or challenged pages", () => {
  execFileSync("python3", ["tests/seo_deployment.py"], { stdio: "pipe" });
});
