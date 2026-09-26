import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = path.resolve(process.argv[2] ?? process.cwd());
const local = path.join(root, "node_modules") + path.sep;
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const lock = JSON.parse(
  fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
);
for (const name of Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
})) {
  const file = fs.realpathSync(path.join(local, name, "package.json"));
  if (!file.startsWith(local))
    throw new Error(`${name} resolves outside this checkout`);
  const actual = JSON.parse(fs.readFileSync(file, "utf8")).version;
  if (actual !== lock.packages[`node_modules/${name}`]?.version)
    throw new Error(`${name} does not match the reviewed lock`);
}
const require = createRequire(path.join(root, "package.json"));
for (const name of [
  "tsx",
  "typescript",
  "next",
  "@playwright/test",
  "sharp",
  "zod",
])
  if (!fs.realpathSync(require.resolve(name)).startsWith(local))
    throw new Error(`${name} would resolve outside this checkout`);
console.log(
  "All direct dependency versions match the lock; verification/build tools resolve within this checkout.",
);
