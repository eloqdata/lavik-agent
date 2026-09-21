import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hash, release } from "../packages/content/repository.ts";
import {
  downloadPackages,
  downloadEvidenceErrors,
} from "../packages/content/downloads.ts";
import { manualPublicationErrors } from "../packages/manual/gate.ts";

test("every published download command has matching Linux Docker verification", () => {
  assert.deepEqual(downloadEvidenceErrors(), []);
  const receipt = JSON.parse(
    fs.readFileSync("evidence/downloads/0.1.0/verification.json", "utf8"),
  );
  assert.equal(receipt.release, release.tag);
  assert.match(receipt.imageId, /^sha256:[a-f0-9]{64}$/);
  for (const [file, expected] of Object.entries(receipt.fileHashes))
    assert.equal(
      hash(fs.readFileSync(file)),
      expected,
      `${file} changed after execution`,
    );
  assert.equal(downloadPackages.length, 4);
  assert.equal(receipt.packages.length, downloadPackages.length);
  for (const pkg of downloadPackages) {
    const verified = receipt.packages.find(
      (p: { filename: string }) => p.filename === pkg.filename,
    );
    assert.equal(verified?.status, "passed");
    assert.equal(verified.commands, pkg.commands);
    assert.equal(verified.sha256, pkg.sha256);
    assert.equal(verified.stdout, `${pkg.filename}: OK`);
  }
});

test("download evidence rejects incomplete, failed, mismatched and stale execution records", () => {
  const original = JSON.parse(
    fs.readFileSync("evidence/downloads/0.1.0/verification.json", "utf8"),
  );
  for (const mutate of [
    (r: typeof original) => {
      r.packages.pop();
    },
    (r: typeof original) => {
      r.packages[0].status = "failed";
    },
    (r: typeof original) => {
      r.packages[0].sha256 = "0".repeat(64);
    },
    (r: typeof original) => {
      r.packages[0].commands = "unexecuted command";
    },
    (r: typeof original) => {
      r.packages[0].stdout = "failure";
    },
    (r: typeof original) => {
      r.packages[0] = r.packages[1];
    },
    (r: typeof original) => {
      r.release = "v9.9.9";
    },
    (r: typeof original) => {
      r.fileHashes["scripts/verify-downloads.ts"] = "0".repeat(64);
    },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.ok(downloadEvidenceErrors(changed).length > 0);
  }
});

test("the publication gate rejects failed downloads before independent review", (t) => {
  const read = fs.readFileSync.bind(fs);
  t.mock.method(fs, "readFileSync", ((
    file: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) => {
    const result = Reflect.apply(read, fs, [file, ...args]);
    if (String(file).endsWith("evidence/downloads/0.1.0/verification.json")) {
      const receipt = JSON.parse(String(result));
      receipt.packages[0].status = "failed";
      return JSON.stringify(receipt);
    }
    return result;
  }) as typeof fs.readFileSync);
  assert.ok(
    manualPublicationErrors({ requireReview: false }).some((error) =>
      error.startsWith("Download evidence"),
    ),
  );
});
