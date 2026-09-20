import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  hash,
  harnessHash,
  readText,
  release,
  root,
} from "../packages/content/repository.ts";

const arch =
  process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : "";
const artifact = release.artifacts[arch];
if (!artifact)
  throw new Error(`Unsupported native architecture: ${process.arch}`);
const directory = path.join(root, ".cache/verifier");
await fs.mkdir(directory, { recursive: true });
const cached = path.join(root, ".cache", artifact.filename);
let bytes: Buffer;
try {
  bytes = await fs.readFile(cached);
} catch {
  const response = await fetch(artifact.url, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== artifact.sha256)
    throw new Error("Downloaded package checksum mismatch");
  await fs.writeFile(cached, bytes);
}
if (hash(bytes) !== artifact.sha256)
  throw new Error("Cached package checksum mismatch");
await fs.writeFile(path.join(directory, "lavik.tar.gz"), bytes);
for (const name of ["Dockerfile", "run.py", "start.sh", "recipes.json"])
  await fs.copyFile(
    path.join(root, "verification", name),
    path.join(directory, name),
  );
execFileSync(
  "docker",
  [
    "build",
    "--build-arg",
    `ARCHIVE_SHA256=${artifact.sha256}`,
    "--build-arg",
    `HARNESS_SHA256=${harnessHash()}`,
    "--build-arg",
    `RECIPES_SHA256=${hash(readText("verification/recipes.json"))}`,
    "-t",
    "lavik-doc-verifier:0.1.0",
    directory,
  ],
  { stdio: "inherit", timeout: 600_000 },
);
console.log(
  `Verifier prepared for ${release.release} / ${arch}; package SHA-256 checked.`,
);
