import { receiptSchema } from "../content/schema.ts";
import { checkReceipt } from "../content/gate.ts";
import { hash } from "../content/repository.ts";

// A saved draft can refer to the date of its original execution. A later
// successful rerun supplements that evidence; it must not replace its history.
export function savedExecutionReceipt(
  prompt: string,
  expectedPromptHash: string,
) {
  if (hash(prompt) !== expectedPromptHash)
    throw new Error("Saved writer prompt hash mismatch");
  const sections = prompt.split("\nACTUAL DOCKER RECEIPT\n");
  if (sections.length !== 2)
    throw new Error("Saved execution evidence is missing or ambiguous");
  const receipt = receiptSchema.parse(
    JSON.parse(sections[1].split("\n", 1)[0]),
  );
  const errors = checkReceipt(receipt, "basic-commands");
  if (errors.length)
    throw new Error(
      `Saved execution evidence is no longer valid: ${errors.join("; ")}`,
    );
  return receipt;
}
