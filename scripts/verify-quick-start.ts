import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import {
  hash,
  readText,
  release,
  harnessHash,
} from "../packages/content/repository.ts";
import {
  quickStartPackages,
  quickStartDependencies,
} from "../packages/quick-start/content.ts";
import {
  quickStartInputHashes,
  quickStartEvidenceErrors,
} from "../packages/quick-start/evidence.ts";

// Public release downloads only; no env files, host devices or credentials.
// Foreign-architecture packages get download/extraction/version checks only.
const nativeArch =
  process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : "";
if (!nativeArch) throw new Error("Unsupported native architecture");
const before = quickStartInputHashes();
const context = path.resolve(".cache/quick-start/verifier");
fs.mkdirSync(context, { recursive: true });
for (const file of ["run.py", "start.sh", "recipes.json"])
  fs.copyFileSync(`verification/${file}`, path.join(context, file));
fs.copyFileSync(
  "verification/quick-start/Dockerfile",
  path.join(context, "Dockerfile"),
);
for (const variant of ["minimal", "standard"] as const)
  fs.writeFileSync(
    path.join(context, `dependencies-${variant}.sh`),
    `set -euo pipefail\n${quickStartDependencies[variant]}\n`,
  );
const packages = [];
for (const arch of [
  nativeArch,
  ...["aarch64", "x86_64"].filter((a) => a !== nativeArch),
]) {
  const platform = arch === "aarch64" ? "linux/arm64" : "linux/amd64";
  const image = `lavik-quick-start:${arch}`;
  execFileSync(
    "docker",
    ["build", "--platform", platform, "-t", image, context],
    { stdio: "inherit", timeout: 600_000 },
  );
  const imageId = execFileSync(
    "docker",
    ["image", "inspect", image, "--format", "{{.Id}}"],
    { encoding: "utf8" },
  ).trim();
  for (const pkg of quickStartPackages.filter((p) => p.arch === arch)) {
    const script = `set -euo pipefail
if command -v lavik; then echo 'Lavik must not be preinstalled on PATH' >&2; exit 1; fi
${pkg.commands}
test "$(cat REVISION)" = "${release.commit}"
test "$(cat VERSION)" = "${release.tag}"
test "$(sha256sum ../${pkg.filename} | cut -d ' ' -f 1)" = "${pkg.sha256}"
${arch === nativeArch ? "python3 /verify/run.py basic-commands" : ""}
`;
    const scriptFile = path.join(context, `${pkg.filename}.sh`);
    fs.writeFileSync(scriptFile, script);
    const containerName = `lavik-quick-start-${randomUUID()}`;
    const argv = [
      "run",
      "--rm",
      "--name",
      containerName,
      "--platform",
      platform,
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--security-opt=seccomp=unconfined",
      "--memory=2g",
      "--cpus=2",
      "--pids-limit=128",
      "--ulimit",
      "memlock=268435456:268435456",
      "--tmpfs",
      "/tmp:rw,exec,nosuid,nodev,size=1536m",
      "--mount",
      `type=bind,src=${scriptFile},dst=/commands.sh,readonly`,
      "-e",
      `EXPECTED_COMMIT=${release.commit}`,
      "-e",
      `EXPECTED_RELEASE=${release.release}`,
      image,
      "/commands.sh",
    ];
    let stdout: string;
    try {
      stdout = execFileSync("docker", argv, {
        encoding: "utf8",
        timeout: 240_000,
        maxBuffer: 4 * 1024 * 1024,
      });
    } finally {
      try {
        execFileSync("docker", ["rm", "-f", containerName], {
          stdio: "ignore",
          timeout: 10000,
        });
      } catch {}
    }
    if (
      !stdout.includes(`${pkg.filename}: OK`) ||
      !stdout.split("\n").includes(`lavik ${release.release}`)
    )
      throw new Error(`Download or version check failed: ${pkg.filename}`);
    const runtime =
      arch === nativeArch
        ? JSON.parse(stdout.trim().split("\n").at(-1)!)
        : null;
    if (runtime && runtime.status !== "passed")
      throw new Error(`Runtime failed: ${pkg.filename}`);
    packages.push({
      filename: pkg.filename,
      sha256: pkg.sha256,
      commands: pkg.commands,
      status: "passed",
      imageId,
      platform,
      sourceCommit: release.commit,
      binaryVersion: `lavik ${release.release}`,
      executableOnPath: false,
      stdout,
      runtime,
    });
    console.log(
      `${pkg.filename}: install/version${runtime ? " + startup/commands/graceful restart" : " (runtime not tested under emulation)"} passed`,
    );
  }
}
if (!isDeepStrictEqual(before, quickStartInputHashes()))
  throw new Error("Inputs changed during execution");
const report = {
  release: release.release,
  sourceCommit: release.commit,
  verifiedAt: new Date().toISOString(),
  nativeArch,
  harnessHash: harnessHash(),
  fileHashes: before,
  dependencies: quickStartDependencies,
  scope:
    "All four release packages: displayed download, checksum, extraction and version commands. Both native-architecture variants: loopback kernel TCP/io_uring startup, displayed Redis commands, and graceful restart. No SPDK device, DPDK networking, performance, or crash test.",
  packages,
};
const errors = quickStartEvidenceErrors(report);
if (errors.length) throw new Error(errors.join("\n"));
fs.mkdirSync("evidence/quick-start/0.1.0", { recursive: true });
fs.writeFileSync(
  "evidence/quick-start/0.1.0/verification.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `Recorded successful quick-start matrix (${hash(JSON.stringify(report))}).`,
);
