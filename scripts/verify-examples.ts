import fs from "node:fs/promises";
import path from "node:path";
import { recipes, root } from "../packages/content/repository.ts";
import { verifyRecipe } from "../packages/verification/runner.ts";

const args = process.argv.slice(2);
if (
  args.length &&
  (args.length !== 2 || args[0] !== "--output-dir" || !args[1])
)
  throw new Error("Usage: npm run verify:examples -- [--output-dir PATH]");
const outputDirectory = path.resolve(root, args[1] ?? "evidence/verification");
await fs.mkdir(outputDirectory, { recursive: true });
for (const recipe of recipes) {
  const receipt = await verifyRecipe(recipe.id);
  await fs.writeFile(
    path.join(outputDirectory, `${recipe.id}.json`),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(`${recipe.id}: ${receipt.status}`);
  if (receipt.status !== "passed") {
    console.error(receipt.output);
    process.exitCode = 1;
  }
}
