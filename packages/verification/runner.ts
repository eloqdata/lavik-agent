import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
  hash,
  harnessHash,
  readText,
  recipes,
  recipeHash,
  release,
} from "../content/repository.ts";
import { receiptSchema, type Receipt } from "../content/schema.ts";

const exec = promisify(execFile);
export async function verifyRecipe(recipeId: string): Promise<Receipt> {
  const digest = recipeHash(recipeId); // Reject unknown recipes before starting any process.
  const startedAt = new Date().toISOString();
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const name = `lavik-doc-${randomUUID()}`;
  let imageId = "unavailable",
    status: Receipt["status"] = "unavailable",
    output = "",
    platform = `${process.platform}/${process.arch}`;
  try {
    const inspected = await exec(
      "docker",
      ["image", "inspect", "lavik-doc-verifier:0.1.0"],
      { timeout: 15_000 },
    );
    const image = JSON.parse(inspected.stdout)[0];
    imageId = image.Id;
    if (
      image.Config.Labels?.["dev.lavik.harness-sha256"] !== harnessHash() ||
      image.Config.Labels?.["dev.lavik.recipes-sha256"] !==
        hash(readText("verification/recipes.json"))
    )
      throw new Error("Verifier image is stale; run npm run verify:prepare");
    // io_uring is blocked by Docker's default seccomp profile. This audited,
    // repository-owned harness has no network, host mounts, devices or secrets.
    // Arbitrary agent-generated shell must never run through this tool.
    const result = await exec(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        name,
        "--network=none",
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
        "/tmp:rw,nosuid,size=1073741824",
        "-e",
        `EXPECTED_COMMIT=${release.commit}`,
        "-e",
        `EXPECTED_RELEASE=${release.release}`,
        imageId,
        recipeId,
      ],
      { timeout: 100_000, maxBuffer: 1024 * 1024 },
    );
    output = result.stdout;
    const transcript = JSON.parse(output);
    platform = transcript.platform;
    const expected = recipes.find((recipe) => recipe.id === recipeId)!.steps;
    const matches =
      Array.isArray(transcript.steps) &&
      transcript.steps.length === expected.length &&
      expected.every(
        (step, index) =>
          JSON.stringify(step.argv) ===
            JSON.stringify(transcript.steps[index].argv) &&
          step.expected === transcript.steps[index].actual,
      );
    status =
      transcript.status === "passed" &&
      transcript.sourceCommit === release.commit &&
      transcript.gracefulRestart === "passed" &&
      matches
        ? "passed"
        : "failed";
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    output = [failure.message, failure.stdout, failure.stderr]
      .filter(Boolean)
      .join("\n");
    status = imageId === "unavailable" ? "unavailable" : "failed";
  } finally {
    // The client timing out does not stop a Docker container. Explicit cleanup.
    await exec("docker", ["rm", "-f", name], { timeout: 10_000 }).catch(
      () => undefined,
    );
  }
  return receiptSchema.parse({
    schemaVersion: 1,
    recipeId,
    recipeHash: digest,
    sourceCommit: release.commit,
    release: release.release,
    artifactSha256: release.artifacts[arch].sha256,
    imageId,
    harnessHash: harnessHash(),
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    platform,
    output,
  });
}
