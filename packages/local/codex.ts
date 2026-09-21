import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Intentionally excludes OPENAI_*, AZURE_*, GitHub/Cloudflare credentials and
// .env. The CLI uses saved ChatGPT authentication, never an API-key fallback.
export function subscriptionEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  return {
    ...Object.fromEntries(
      [
        "PATH",
        "HOME",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "TZ",
        "USER",
        "LOGNAME",
        "SHELL",
        "TERM",
        "CODEX_HOME",
      ].flatMap((key) => (env[key] ? [[key, env[key]!]] : [])),
    ),
    NODE_ENV: "production" as const,
  };
}

export const subscriptionConfig = [
  "-c",
  'model_provider="openai"',
  "-c",
  'forced_login_method="chatgpt"',
];

export function codexArguments(role: "writer" | "reviewer", directory: string) {
  return [
    "exec",
    "--ignore-user-config",
    ...subscriptionConfig,
    "-m",
    "gpt-6-astra",
    "-c",
    `model_reasoning_effort="${role === "writer" ? "medium" : "high"}"`,
    "-c",
    "features.shell_tool=false",
    "-c",
    "features.unified_exec=false",
    "-c",
    'web_search="disabled"',
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--skip-git-repo-check",
    "-C",
    directory,
    "--json",
    "--output-schema",
    path.join(directory, "schema.json"),
    "-o",
    path.join(directory, "result.json"),
    "-",
  ];
}

export function codexInvocationBudget(
  role: "writer" | "reviewer",
  additionalReviewReason?: string,
  additionalBatchReviewReason?: string,
) {
  if (additionalBatchReviewReason?.trim()) {
    if (role !== "reviewer" || additionalBatchReviewReason.length > 120)
      throw new Error(
        "A batch extension requires a reviewer and a short explicit reason.",
      );
    return { roleLimit: 4, totalLimit: 5 };
  }
  return {
    roleLimit: role === "reviewer" && additionalReviewReason?.trim() ? 3 : 2,
    totalLimit: 4,
  };
}

export async function runLocalCodex(options: {
  role: "writer" | "reviewer";
  taskDirectory: string;
  prompt: string;
  schema: unknown;
  additionalReviewReason?: string;
  additionalBatchReviewReason?: string;
}) {
  const task = path.resolve(options.taskDirectory);
  await fs.mkdir(task, { recursive: true, mode: 0o700 });
  // Four total attempts, normally at most two per role. A specifically
  // requested third review can use an unused writer slot; it does not expand
  // the total budget. An explicit batch follow-up allows one additional call,
  // up to four reviewer calls and five total, with its reason in the receipt.
  // No automatic retries or quota recovery are enabled. Exclusive creation also
  // prevents two coordinators from silently consuming the same task budget.
  let directory: string | undefined;
  const { roleLimit: limit, totalLimit } = codexInvocationBudget(
    options.role,
    options.additionalReviewReason,
    options.additionalBatchReviewReason,
  );
  for (let attempt = 1; attempt <= limit; attempt++) {
    const candidate = path.join(task, `${options.role}-${attempt}`);
    try {
      await fs.mkdir(candidate, { mode: 0o700 });
      directory = candidate;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  if (!directory)
    throw new Error(
      `Local task ${options.role} invocation budget exhausted (${limit}).`,
    );
  const attempts = (await fs.readdir(task)).filter((entry) =>
    /^(writer|reviewer)-[1-4]$/.test(entry),
  );
  if (attempts.length > totalLimit)
    throw new Error(
      `Local task total invocation budget exhausted (${totalLimit}). No model request was made.`,
    );
  const env = subscriptionEnvironment();
  async function invoke(
    args: string[],
    filename: string,
    input = "",
    timeoutMs = 20 * 60_000,
  ) {
    const log = await fs.open(path.join(directory!, filename), "wx", 0o600);
    const child = spawn("codex", args, {
      env,
      stdio: ["pipe", log.fd, log.fd],
    });
    child.stdin!.on("error", () => {});
    child.stdin!.end(input);
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), 5000);
    }, timeoutMs);
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      if (timedOut || code !== 0)
        throw new Error(
          `Local Codex ${timedOut ? "timed out" : `exited ${code}`}; inspect ${filename}. No fallback was attempted.`,
        );
    } finally {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      await log.close();
    }
  }
  await invoke(
    [...subscriptionConfig, "login", "status"],
    "auth.log",
    "",
    30_000,
  );
  if (
    !(await fs.readFile(path.join(directory, "auth.log"), "utf8")).includes(
      "Logged in using ChatGPT",
    )
  )
    throw new Error(
      "Saved ChatGPT authentication is required. No model request was made.",
    );
  await fs.writeFile(
    path.join(directory, "schema.json"),
    JSON.stringify(options.schema),
    { mode: 0o600 },
  );
  await fs.writeFile(path.join(directory, "prompt.txt"), options.prompt, {
    mode: 0o600,
  });
  const startedAt = new Date().toISOString();
  await invoke(
    codexArguments(options.role, directory),
    "events.jsonl",
    options.prompt,
  );
  const resultText = await fs.readFile(
    path.join(directory, "result.json"),
    "utf8",
  );
  const result: unknown = JSON.parse(resultText);
  const receipt = {
    role: options.role,
    model: "gpt-6-astra",
    provider: "openai",
    authentication: "chatgpt",
    reasoning: options.role === "writer" ? "medium" : "high",
    ...(options.additionalReviewReason
      ? { additionalReviewReason: options.additionalReviewReason }
      : {}),
    ...(options.additionalBatchReviewReason
      ? { additionalBatchReviewReason: options.additionalBatchReviewReason }
      : {}),
    startedAt,
    finishedAt: new Date().toISOString(),
    promptSha256: createHash("sha256").update(options.prompt).digest("hex"),
    outputSha256: createHash("sha256").update(resultText).digest("hex"),
    output: path.relative(process.cwd(), path.join(directory, "result.json")),
  };
  await fs.writeFile(
    path.join(directory, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  return { result, receipt };
}
