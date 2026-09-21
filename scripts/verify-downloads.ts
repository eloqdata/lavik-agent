import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  downloadPackages,
  downloadVerificationPaths,
} from "../packages/content/downloads.ts";
import { isDeepStrictEqual } from "node:util";
import { hash, release } from "../packages/content/repository.ts";

// No env files or API credentials are passed to Docker. Only public GitHub
// downloads are fetched. This does not execute or claim to test the binaries.
const image = "lavik-download-verifier:0.1.0";
const inputHashes = () =>
  Object.fromEntries(
    downloadVerificationPaths.map((f) => [f, hash(fs.readFileSync(f))]),
  );
const before = inputHashes();
execFileSync("docker", ["build", "-t", image, "verification/downloads"], {
  stdio: "inherit",
});
const imageId = execFileSync(
  "docker",
  ["image", "inspect", image, "--format", "{{.Id}}"],
  { encoding: "utf8" },
).trim();
const directory = path.resolve(".cache/download-verification");
fs.mkdirSync(directory, { recursive: true });
const results = [];
for (const pkg of downloadPackages) {
  const extracted = pkg.filename.slice(0, -7);
  const script = `set -euo pipefail
${pkg.commands}
test "$(sha256sum ${pkg.filename} | cut -d ' ' -f 1)" = "${pkg.sha256}"
test "$(cat ${extracted}/VERSION)" = "${release.tag}"
test "$(cat ${extracted}/REVISION)" = "${release.commit}"
test -f ${extracted}/lavik
test -f ${extracted}/lavik-meta
test -f ${extracted}/lavik-ctl
test -f ${extracted}/LICENSE
`;
  const file = path.join(directory, "commands.sh");
  fs.writeFileSync(file, script);
  const stdout = execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--memory=512m",
      "--cpus=1",
      "--pids-limit=64",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,size=512m",
      "--mount",
      `type=bind,src=${file},dst=/verify.sh,readonly`,
      imageId,
      "/verify.sh",
    ],
    { encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024 },
  );
  if (!stdout.includes(`${pkg.filename}: OK`))
    throw new Error(`Checksum check did not pass: ${pkg.filename}`);
  results.push({
    filename: pkg.filename,
    sha256: pkg.sha256,
    commands: pkg.commands,
    status: "passed",
    stdout: stdout.trim(),
  });
  console.log(`Verified download, checksum and extraction: ${pkg.filename}`);
}
const hashes = inputHashes();
if (!isDeepStrictEqual(before, hashes))
  throw new Error("Download verifier inputs changed during execution");
fs.mkdirSync("evidence/downloads/0.1.0", { recursive: true });
fs.writeFileSync(
  "evidence/downloads/0.1.0/verification.json",
  JSON.stringify(
    {
      release: release.tag,
      verifiedAt: new Date().toISOString(),
      platform: "Linux Docker",
      imageId,
      scope:
        "Public release downloads, publisher SHA-256 files, and archive extraction. Does not execute the binaries or verify runtime architecture support.",
      fileHashes: hashes,
      packages: results,
    },
    null,
    2,
  ) + "\n",
);
