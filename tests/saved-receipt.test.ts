import assert from "node:assert/strict";
import test from "node:test";
import { savedExecutionReceipt } from "../packages/marketing/saved-receipt.ts";
import { storedReceipt } from "../packages/content/gate.ts";
import { hash } from "../packages/content/repository.ts";

const receipt = storedReceipt("basic-commands");
const prompt = `Evidence packet\nACTUAL DOCKER RECEIPT\n${JSON.stringify(receipt)}\nASSIGNMENT\nWrite both editions`;

test("review recovery retains original execution timestamps and verified transcript", () => {
  const recovered = savedExecutionReceipt(prompt, hash(prompt));
  assert.deepEqual(recovered, receipt);
  assert.equal(recovered.completedAt, receipt.completedAt);
  assert.equal(recovered.output, receipt.output);
});

test("modified writer evidence fails provenance validation", () => {
  assert.throws(
    () => savedExecutionReceipt(prompt + "changed", hash(prompt)),
    /hash mismatch/,
  );
});

test("missing or ambiguous saved execution evidence fails closed", () => {
  for (const text of ["No receipt", `${prompt}\nACTUAL DOCKER RECEIPT\n{}`])
    assert.throws(
      () => savedExecutionReceipt(text, hash(text)),
      /missing or ambiguous/,
    );
});

test("old execution cannot authorize a changed verification environment", () => {
  const changed = { ...receipt, harnessHash: "0".repeat(64) };
  const text = `Evidence\nACTUAL DOCKER RECEIPT\n${JSON.stringify(changed)}\nASSIGNMENT`;
  assert.throws(
    () => savedExecutionReceipt(text, hash(text)),
    /verification environment changed/,
  );
});
