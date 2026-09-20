import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { root } from "../packages/content/repository.ts";
import {
  preparePublication,
  PublicationBlocked,
  verifyLivePublication,
} from "../packages/admin/publish.ts";
import type { Publication, Task } from "../packages/admin/contracts.ts";

const exec = promisify(execFile);
const endpoint = new URL(process.env.LAVIK_ADMIN_URL ?? "https://lavik.dev");
if (endpoint.origin !== "https://lavik.dev")
  throw new Error("The production publisher targets https://lavik.dev only.");
if (
  process.env.GITHUB_REPOSITORY !== "eloqdata/lavik-agent" ||
  process.env.GITHUB_REF !== "refs/heads/main"
)
  throw new Error(
    "Publication requires a trusted main-branch workflow in eloqdata/lavik-agent.",
  );
const token = process.env.LAVIK_PUBLISHER_TOKEN;
if (!token || token.length < 32)
  throw new Error("Configure LAVIK_PUBLISHER_TOKEN.");
const runUrl = `https://github.com/eloqdata/lavik-agent/actions/runs/${process.env.GITHUB_RUN_ID}`;
async function api(route: string, body: unknown) {
  const response = await fetch(new URL(route, endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
    redirect: "manual",
  });
  if (!response.ok)
    throw new Error(`Publisher API returned HTTP ${response.status}.`);
  return response.json();
}
const claim = (await api("/api/publisher/claim", {
  runnerId: `publisher-${process.env.GITHUB_RUN_ID}`,
  runUrl,
})) as {
  task: Pick<Task, "id" | "role" | "articleId" | "result"> | null;
  publication: Publication;
  leaseToken: string;
};
if (!claim.task) {
  console.log("No reviewed task is ready for website publication.");
} else {
  const task = claim.task;
  const directory = path.join(root, ".runs/publication", task.id);
  await fs.mkdir(directory, { recursive: true });
  const controller = new AbortController();
  const deadline = setTimeout(
    () =>
      controller.abort(new Error("Publication exceeded its 18-minute limit.")),
    18 * 60_000,
  );
  let pending = Promise.resolve<unknown>(undefined);
  const update = (body: object) => {
    const operation = pending
      .catch(() => undefined)
      .then(() =>
        api(`/api/publisher/tasks/${task.id}`, {
          leaseToken: claim.leaseToken,
          artifactHash: claim.publication.artifactHash,
          ...body,
        }),
      );
    pending = operation;
    return operation;
  };
  let heartbeatFailures = 0;
  const heartbeat = setInterval(() => {
    void update({ stage: "heartbeat" })
      .then(() => {
        heartbeatFailures = 0;
      })
      .catch((error) => {
        if (String(error).includes("409") || ++heartbeatFailures >= 3)
          controller.abort(error);
      });
  }, 20_000);
  const secrets = [
    token,
    process.env.GITHUB_TOKEN,
    process.env.CLOUDFLARE_API_TOKEN,
  ].filter((s): s is string => Boolean(s));
  const redact = (value: string) =>
    secrets.reduce(
      (safe, secret) => safe.replaceAll(secret, "[redacted]"),
      value,
    );
  const childEnv = { ...process.env };
  for (const name of [
    "OPENAI_API_KEY",
    "LAVIK_RUNNER_TOKEN",
    "CLOUDFLARE_ACCESS_API_TOKEN",
    "LAVIK_GITHUB_DISPATCH_TOKEN",
  ])
    delete childEnv[name];
  let commandNumber = 0;
  async function command(
    program: string,
    args: string[],
    allowDifference = false,
  ) {
    controller.signal.throwIfAborted();
    const log = path.join(directory, `${++commandNumber}-${program}.log`);
    try {
      const result = await exec(program, args, {
        cwd: root,
        env: childEnv,
        signal: controller.signal,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10 * 60_000,
      });
      await fs.writeFile(log, redact(result.stdout + result.stderr), {
        mode: 0o600,
      });
      return { code: 0, output: result.stdout };
    } catch (error) {
      const failure = error as {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      await fs.writeFile(
        log,
        redact((failure.stdout ?? "") + (failure.stderr ?? "")),
        { mode: 0o600 },
      );
      if (allowDifference && failure.code === 1)
        return { code: 1, output: failure.stdout ?? "" };
      throw new Error(
        `Publication step ${commandNumber} (${program}) failed. Inspect the publisher run; private command output was not published.`,
      );
    }
  }
  try {
    if (process.env.LAVIK_AUTO_DEPLOY !== "true")
      throw new PublicationBlocked(
        "Enable LAVIK_AUTO_DEPLOY to publish to the website.",
      );
    await command("git", ["fetch", "origin", "main"]);
    await command("git", ["merge", "--ff-only", "origin/main"]);
    const base = (await command("git", ["rev-parse", "HEAD"])).output.trim();
    const prepared = await preparePublication(
      task,
      claim.publication.artifactHash,
    );
    console.log(
      `Publication ${task.id}: exact reviewed artifact validated; preparing both language editions.`,
    );
    await command("npm", ["run", "check"]);
    await command("npx", ["playwright", "install", "--with-deps", "chromium"]);
    await command("npm", ["run", "test:browser"]);
    await command("git", ["fetch", "origin", "main"]);
    if (
      (await command("git", ["rev-parse", "origin/main"])).output.trim() !==
      base
    )
      throw new Error(
        "Main changed during publication checks. Retry against the latest commit.",
      );
    await command("git", ["add", "--", ...prepared.files]);
    const staged = (
      await command("git", ["diff", "--cached", "--name-only", "-z"])
    ).output
      .split("\0")
      .filter(Boolean);
    if (staged.some((file) => !prepared.files.includes(file)))
      throw new PublicationBlocked(
        "The staged changes include files outside this reviewed publication.",
      );
    if (staged.length) {
      await command("git", ["config", "user.name", "lavik-agent[bot]"]);
      await command("git", [
        "config",
        "user.email",
        "lavik-agent[bot]@users.noreply.github.com",
      ]);
      await command("git", [
        "commit",
        "-m",
        "Publish reviewed bilingual website article",
      ]);
      await command("git", ["push", "origin", "HEAD:main"]);
    }
    const commit = (await command("git", ["rev-parse", "HEAD"])).output.trim();
    await update({ stage: "deploying", commit });
    console.log(
      `Publication ${task.id}: deploying verified content to Cloudflare.`,
    );
    const deployment = await command("npx", [
      "wrangler",
      "deploy",
      "--env-file",
      "/dev/null",
    ]);
    const deploymentId = deployment.output.match(
      /Current Version ID:\s*([a-f0-9-]{36})/i,
    )?.[1];
    if (!deploymentId)
      throw new Error(
        "Cloudflare did not return a deployment version; retry will reconcile the saved content.",
      );
    let verified = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      controller.signal.throwIfAborted();
      try {
        await verifyLivePublication(prepared.record);
        verified = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    if (!verified)
      throw new Error(
        "Cloudflare deployed, but the reviewed bilingual pages could not yet be verified live. Publication will retry.",
      );
    clearInterval(heartbeat);
    await update({ stage: "published", commit, deploymentId });
    console.log(
      `Publication ${task.id}: both reviewed language editions verified live; Published status saved.`,
    );
  } catch (error) {
    clearInterval(heartbeat);
    const message = redact(
      error instanceof Error ? error.message : "Publication failed.",
    ).slice(0, 1900);
    await pending.catch(() => undefined);
    await update({
      stage: "failed",
      error: message,
      retryable: !(error instanceof PublicationBlocked),
    }).catch(() => undefined);
    console.error(
      `Publication ${task.id} did not finish. Status and next action are saved in the private admin console.`,
    );
    process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadline);
  }
}
