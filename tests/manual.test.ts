import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  manualCases,
  commandReport,
  clientReport,
  manualClients,
  readManualFile,
} from "../packages/manual/repository";
import {
  manualEvidenceErrors,
  manualPublicationErrors,
  requireReviewedManual,
} from "../packages/manual/gate";

test("the export guard refuses a failed review even if called outside the npm build script", (t) => {
  const original = fs.readFileSync.bind(fs);
  t.mock.method(fs, "readFileSync", ((
    file: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) => {
    const result = Reflect.apply(original, fs, [file, ...args]);
    if (String(file).endsWith("evidence/manual/0.1.0/publication.json")) {
      const publication = JSON.parse(String(result));
      publication.review.decision = "changes_required";
      return JSON.stringify(publication);
    }
    return result;
  }) as typeof fs.readFileSync);
  assert.throws(
    () => requireReviewedManual(),
    /Independent review has not passed/,
  );
});

function bundle() {
  return {
    names: readManualFile<{ commands: { name: string }[] }>(
      "content/manual/0.1.0/inventory.json",
    ).commands.map((c) => c.name),
    cases: manualCases(),
    commands: commandReport(),
    clients: manualClients(),
    clientResults: clientReport(),
  };
}
test("every registered command and listed client has verified evidence and a current independent review", () => {
  assert.deepEqual(manualEvidenceErrors(bundle()), []);
  assert.deepEqual(manualPublicationErrors(), []);
});
test("the manual gate rejects a changed reply even when the report still says passed", () => {
  const data = bundle();
  data.commands.commands.find((c) => c.name === "GET")!.steps.at(-1)!.actual =
    "fabricated";
  assert.ok(manualEvidenceErrors(data).some((e) => e.includes("GET: step")));
});
test("the manual gate rejects missing command or client coverage and version drift", () => {
  const data = bundle();
  data.commands.commands.pop();
  data.clientResults.clients[0].version = "untested";
  assert.ok(
    manualEvidenceErrors(data).some((e) => e.includes("Command receipts")),
  );
  assert.ok(
    manualEvidenceErrors(data).some((e) => e.includes("exact-version")),
  );
});
test("SCAN evidence must follow all continuation cursors, including empty batches", () => {
  const data = bundle();
  const scan = data.commands.commands
    .find((c) => c.name === "SCAN")!
    .steps.at(-1)!;
  scan.iterations!.splice(1, 1);
  assert.ok(
    manualEvidenceErrors(data).some((e) =>
      e.includes("SCAN: wrong continuation cursor"),
    ),
  );
});
test("ZSCAN allows reordered member-score pairs but rejects a changed score", () => {
  const data = bundle();
  const step = data.commands.commands
    .find((c) => c.name === "ZSCAN")!
    .steps.at(-1)!;
  step.actual = ["0", ["b", "2", "a", "1"]];
  assert.deepEqual(manualEvidenceErrors(data), []);
  step.actual = ["0", ["b", "99", "a", "1"]];
  assert.ok(manualEvidenceErrors(data).some((e) => e.includes("ZSCAN: step")));
});
test("a rejection-only command cannot be silently relabeled as supported", () => {
  const data = bundle();
  data.commands.commands.find((c) => c.name === "ADDREPLICAOF")!.scope =
    "example";
  assert.ok(
    manualEvidenceErrors(data).some((e) =>
      e.includes("ADDREPLICAOF: incomplete case"),
    ),
  );
});
