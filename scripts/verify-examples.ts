import fs from "node:fs/promises";
import path from "node:path";
import { recipes, root } from "../packages/content/repository.ts";
import { verifyRecipe } from "../packages/verification/runner.ts";

await fs.mkdir(path.join(root, "evidence/verification"), { recursive: true });
for (const recipe of recipes) {
  const receipt = await verifyRecipe(recipe.id);
  await fs.writeFile(
    path.join(root, "evidence/verification", `${recipe.id}.json`),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(`${recipe.id}: ${receipt.status}`);
  if (receipt.status !== "passed") {
    console.error(receipt.output);
    process.exitCode = 1;
  }
}
