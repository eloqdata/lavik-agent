import fs from "node:fs/promises";
import path from "node:path";
import { createOpenAIRuntime } from "../packages/agents/openai.ts";
import { openAIConfig } from "../packages/agents/config.ts";
import { articles, root } from "../packages/content/repository.ts";
import { verifyRecipe } from "../packages/verification/runner.ts";
import { executeTask } from "../packages/admin/execute.ts";
import { type Task, type TaskResult } from "../packages/admin/contracts.ts";

const endpoint = new URL(process.env.LAVIK_ADMIN_URL ?? "https://lavik.dev");
if (
  endpoint.protocol !== "https:" &&
  !["127.0.0.1", "localhost"].includes(endpoint.hostname)
)
  throw new Error("Admin endpoint must use HTTPS");
const token = process.env.LAVIK_RUNNER_TOKEN;
if (!token || token.length < 32) throw new Error("Set LAVIK_RUNNER_TOKEN");
const config = openAIConfig(process.env);
const runUrl = process.env.GITHUB_RUN_ID
  ? `https://github.com/eloqdata/lavik-agent/actions/runs/${process.env.GITHUB_RUN_ID}`
  : undefined;
const runnerId = process.env.GITHUB_RUN_ID
  ? `github-${process.env.GITHUB_RUN_ID}`
  : `local-${process.pid}`;
async function api(route: string, body: unknown) {
  const response = await fetch(new URL(route, endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      `Admin API ${response.status}: ${(await response.text()).slice(0, 500)}`,
    );
  return response.json();
}
async function runOne(): Promise<boolean> {
  const catalog = articles()
    .filter((a) => a.locale === "en" && ["docs", "blog"].includes(a.kind))
    .map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.title,
      version: a.version,
    }));
  const claim = (await api("/api/runner/claim", {
    runnerId,
    model: config.writer.model,
    reviewerModel: config.reviewer.model,
    runUrl,
    catalog,
  })) as {
    task: Task | null;
    leaseToken?: string;
    previous?: TaskResult;
    feedback?: string[];
  };
  if (!claim.task) {
    console.log("No queued task; worker heartbeat saved.");
    return false;
  }
  const task = claim.task,
    directory = path.join(root, ".runs", "admin", task.id);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, "task.json"),
    JSON.stringify(task, null, 2),
  );
  const controller = new AbortController();
  const deadline = setTimeout(
    () =>
      controller.abort(new Error("Task reached its 50-minute runtime limit")),
    50 * 60 * 1000,
  );
  let stage = "Starting",
    activeRole = task.role;
  // Serialize progress and heartbeat updates so a late heartbeat cannot overwrite newer status.
  let pending = Promise.resolve();
  const update = (data: Record<string, unknown>) => {
    const operation = pending
      .catch(() => undefined)
      .then(async () => {
        controller.signal.throwIfAborted();
        await api(`/api/runner/tasks/${task.id}`, {
          leaseToken: claim.leaseToken,
          stage,
          activeRole,
          ...data,
        });
      });
    pending = operation;
    return operation;
  };
  let heartbeatFailures = 0;
  const heartbeat = setInterval(() => {
    void update({})
      .then(() => {
        heartbeatFailures = 0;
      })
      .catch((error) => {
        if (String(error).includes("409") || ++heartbeatFailures >= 3)
          controller.abort(error);
      });
  }, 20000);
  const redact = (value: string) =>
    [token, process.env.OPENAI_API_KEY]
      .filter((secret): secret is string => Boolean(secret))
      .reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value);
  try {
    const runtime = createOpenAIRuntime(
      process.env,
      async (type, data) => {
        const safe = JSON.parse(redact(JSON.stringify(data)));
        await fs.appendFile(
          path.join(directory, "events.jsonl"),
          JSON.stringify({ at: new Date().toISOString(), type, data: safe }) +
            "\n",
        );
        await update({
          event: { type, message: type.replaceAll("-", " "), data: safe },
        });
      },
      controller.signal,
    );
    const result = await executeTask(
      task,
      runtime,
      verifyRecipe,
      async (progress) => {
        stage = progress.stage;
        activeRole = progress.activeRole;
        if (progress.result)
          await fs.writeFile(
            path.join(directory, "result.json"),
            JSON.stringify(progress.result, null, 2),
          );
        await update(progress);
      },
      claim.previous,
      claim.feedback,
      controller.signal,
    );
    clearInterval(heartbeat);
    await update({ stage: "complete", result });
    console.log(
      `Task ${task.id} completed; drafts and independent reviews saved in the admin console.`,
    );
  } catch (error) {
    const message = redact(
      error instanceof Error ? error.message : String(error),
    ).slice(0, 1800);
    await pending.catch(() => undefined);
    await api(`/api/runner/tasks/${task.id}`, {
      leaseToken: claim.leaseToken,
      stage: "Failed",
      error: message,
    }).catch(() => undefined);
    console.error(
      `Task ${task.id} failed. Details are available in the private admin console.`,
    );
    process.exitCode = 1;
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadline);
  }
  return true;
}
const once = process.argv.includes("--once");
do {
  await runOne();
  if (!once) await new Promise((resolve) => setTimeout(resolve, 15000));
} while (!once);
