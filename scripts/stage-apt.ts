import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
const manifest = JSON.parse(
  fs.readFileSync("packages/apt/manifest.json", "utf8"),
);
const sha = (file: string) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const cache = ".cache/apt-artifacts";
fs.mkdirSync(cache, { recursive: true });
const archive = path.join(cache, manifest.artifact.sha256 + ".tar.gz");
if (!fs.existsSync(archive)) {
  const temporary = archive + ".download";
  try {
    execFileSync(
      "curl",
      [
        "--fail",
        "--location",
        "--retry",
        "3",
        "--output",
        temporary,
        manifest.artifact.url,
      ],
      { stdio: "inherit" },
    );
    if (sha(temporary) !== manifest.artifact.sha256)
      throw new Error("APT artifact checksum mismatch");
    fs.renameSync(temporary, archive);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
if (sha(archive) !== manifest.artifact.sha256)
  throw new Error("Cached APT artifact checksum mismatch");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lavik-apt-stage-"));
try {
  // Only a hash-locked, reviewed public artifact is extracted here.
  execFileSync("tar", ["-xzf", path.resolve(archive), "-C", scratch]);
  const files = fs
    .readdirSync(scratch, { recursive: true })
    .map(String)
    .filter((f) => fs.statSync(path.join(scratch, f)).isFile())
    .sort();
  const expected = manifest.files.map((f: { path: string }) => f.path).sort();
  if (JSON.stringify(files) !== JSON.stringify(expected))
    throw new Error("Unexpected APT artifact contents");
  for (const file of manifest.files) {
    if (file.path.includes("..") || path.isAbsolute(file.path))
      throw new Error("Unsafe APT path");
    const local = path.join(scratch, file.path);
    if (
      !fs.lstatSync(local).isFile() ||
      fs.statSync(local).size !== file.size ||
      file.size >= 25 * 1024 * 1024 ||
      sha(local) !== file.sha256
    )
      throw new Error(`APT file mismatch: ${file.path}`);
  }
  const output = process.argv[2] ?? "apps/web/out/apt";
  // Never allow this build helper to replace arbitrary directories.
  if (!["apps/web/out/apt", ".cache/apt-staged"].includes(output))
    throw new Error("Unsupported APT output directory");
  fs.rmSync(output, { recursive: true, force: true });
  fs.cpSync(scratch, output, { recursive: true });
  console.log(`Staged ${files.length} verified APT assets at ${output}`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
