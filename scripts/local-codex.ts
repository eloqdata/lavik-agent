import fs from "node:fs/promises";
import { runLocalCodex } from "../packages/local/codex.ts";

const [role, taskDirectory, promptPath, schemaPath] = process.argv.slice(2);
if (
  (role !== "writer" && role !== "reviewer") ||
  !taskDirectory ||
  !promptPath ||
  !schemaPath
)
  throw new Error(
    "Usage: local-codex.ts writer|reviewer task-directory prompt-file schema-file",
  );
const { receipt } = await runLocalCodex({
  role,
  taskDirectory,
  prompt: await fs.readFile(promptPath, "utf8"),
  schema: JSON.parse(await fs.readFile(schemaPath, "utf8")),
});
console.log(JSON.stringify(receipt, null, 2));
