import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fullReviewFile } from "../packages/local/review-packet.ts";
test("lockfile packets include full current bytes across committed and uncommitted changes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lavik-packet-")),
    file = path.join(root, "package-lock.json");
  const git = (args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.email=fixture@example.test",
        "-c",
        "user.name=Fixture",
        ...args,
      ],
      { cwd: root, stdio: "pipe" },
    );
  try {
    git(["init"]);
    await fs.writeFile(file, '{"approved":"baseline"}\n');
    git(["add", "package-lock.json"]);
    git(["commit", "-m", "Baseline"]);
    const baseline = await fullReviewFile(file);
    const committed =
      '{"approved":"baseline","committed-change":"new-version"}\n';
    await fs.writeFile(file, committed);
    git(["add", "package-lock.json"]);
    git(["commit", "-m", "Changed lock"]);
    assert.equal((await fullReviewFile(file)).text, committed);
    const mixed =
      '{"approved":"baseline","committed-change":"new-version","working-change":"integrity"}\n';
    await fs.writeFile(file, mixed);
    assert.equal((await fullReviewFile(file)).text, mixed);
    await assert.rejects(
      fullReviewFile(file, baseline.sha256),
      /Review input changed/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
