import { waitForDeployment } from "../packages/marketing/deployment.ts";
import { articles } from "../packages/content/repository.ts";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { campaignUrl } from "../packages/marketing/attribution.ts";
import {
  renderReport,
  type MarketingReport,
} from "../packages/marketing/report.ts";
import {
  acquireProcessLock,
  recoverProcessLock,
  groupAlive,
} from "../packages/marketing/process-lock.ts";
import { subscriptionEnvironment } from "../packages/local/codex.ts";
import {
  scheduleSchema,
  calendarDay,
  addCalendarDays,
  mondayOf,
} from "../packages/marketing/schedule.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, ".runs/local/marketing"),
  stateFile = path.join(directory, "state.json");
type Job = {
  id: string;
  date: string;
  brief: string;
  status: string;
  directory: string;
  worktree: string;
  commit?: string;
  runUrl?: string;
  error?: string;
  publishedAt?: string;
  urls?: string[];
};
type State = {
  schemaVersion: 1;
  paused: boolean;
  nextBlogDate: string;
  lastReportWeek?: string;
  jobs: Job[];
};
const config = scheduleSchema.parse(
  JSON.parse(
    await fs.readFile(
      path.join(root, "policies/marketing-schedule.json"),
      "utf8",
    ),
  ),
);
const localDay = (date = new Date()) => calendarDay(date, config.timezone);
const addDays = addCalendarDays;
const weekStart = (date = localDay()) => mondayOf(date);
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
const command = process.argv[2] ?? "status";
if (command === "link") {
  console.log(
    campaignUrl(
      process.argv[3]!,
      process.argv[4]!,
      process.argv[5]!,
      articles()
        .filter((a) => a.kind === "blog")
        .map((a) => a.id),
    ),
  );
  process.exit(0);
}
const load = async (): Promise<State> =>
  fs
    .readFile(stateFile, "utf8")
    .then(JSON.parse)
    .catch((e) => {
      if (e.code !== "ENOENT") throw e;
      return {
        schemaVersion: 1,
        paused: false,
        nextBlogDate: localDay(),
        jobs: [],
      };
    });
let state = await load();
if (
  state.schemaVersion !== 1 ||
  !Array.isArray(state.jobs) ||
  typeof state.paused !== "boolean" ||
  !/^\d{4}-\d{2}-\d{2}$/.test(state.nextBlogDate)
)
  throw new Error(
    "Invalid state; preserve it for recovery instead of resetting the queue",
  );
const save = async () => {
  await fs.writeFile(
    stateFile + ".tmp",
    JSON.stringify(state, null, 2) + "\n",
    { mode: 0o600 },
  );
  await fs.rename(stateFile + ".tmp", stateFile);
};
if (command === "status") {
  console.log(
    JSON.stringify(
      {
        ...state,
        reportDirectory: path.join(directory, "reports"),
        schedule: config,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
const lock = path.join(directory, "lock");
if (command === "recover") {
  recoverProcessLock(lock);
  console.log(
    "Stopped-process lock recovered. Saved task attempts remain unchanged.",
  );
  process.exit(0);
}
const ownership = acquireProcessLock(lock);
state = await load();
async function run(
  executable: string,
  args: string[],
  cwd = root,
  logFile?: string,
  timeout = 45 * 60_000,
) {
  const log = logFile ? await fs.open(logFile, "a", 0o600) : undefined;
  const child = spawn(
    process.execPath,
    [
      path.join(root, "scripts/marketing-child.mjs"),
      String(process.pid),
      executable,
      ...args,
    ],
    {
      cwd,
      env: {
        ...subscriptionEnvironment(),
        GIT_TERMINAL_PROMPT: "0",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    },
  );
  child.stdin.on("error", () => {});
  if (child.pid) {
    try {
      ownership.addChild(child.pid);
      child.stdin.end("go\n");
    } catch (e) {
      process.kill(-child.pid, "SIGKILL");
      throw e;
    }
  }
  let output = "";
  child.stdout.on("data", (b) => {
    output = (output + b).slice(-2_000_000);
    if (log) void log.write(b);
  });
  child.stderr.on("data", (b) => {
    if (log) void log.write(b);
    else output = (output + b).slice(-2_000_000);
  });
  let timedOut = false,
    hard: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {}
    hard = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
    }, 5000);
  }, timeout);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (code !== 0 || timedOut)
      throw new Error(
        `${executable} ${timedOut ? "timed out" : `exited ${code}`}${logFile ? `; inspect ${logFile}` : `: ${output.slice(-1200)}`}`,
      );
    return output.trim();
  } finally {
    clearTimeout(timer);
    if (hard) clearTimeout(hard);
    await log?.close();
    if (child.pid) {
      if (groupAlive(child.pid)) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
        for (let n = 0; n < 20 && groupAlive(child.pid); n++)
          await new Promise((resolve) => setTimeout(resolve, 100));
      }
      ownership.removeChild(child.pid);
    }
  }
}
async function report() {
  const token = (
    await fs.readFile(
      path.join(root, ".secrets/marketing/report-token"),
      "utf8",
    )
  ).trim();
  const end = weekStart(),
    since = addDays(end, -7),
    url = new URL("https://lavik.dev/api/analytics/report");
  url.searchParams.set("since", `${since}T00:00:00.000Z`);
  url.searchParams.set("until", `${end}T00:00:00.000Z`);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Private report fetch failed: HTTP ${response.status}`);
  const data = (await response.json()) as MarketingReport;
  if (!Array.isArray(data.rows)) throw new Error("Invalid aggregate report");
  const reportDir = path.join(directory, "reports", end);
  await fs.mkdir(reportDir, { recursive: true, mode: 0o700 });
  const previousFile = path.join(directory, "reports", since, "report.json");
  const previous = await fs
    .readFile(previousFile, "utf8")
    .then(JSON.parse)
    .catch((e) => {
      if (e.code !== "ENOENT") throw e;
      return undefined;
    });
  const rendered = renderReport(data, previous);
  const jobs = state.jobs
    .filter((j) => j.date >= since && j.date < end)
    .map((j) => `- ${j.id}: ${j.status}${j.error ? ` — ${j.error}` : ""}`)
    .join("\n");
  await Promise.all([
    fs.writeFile(
      path.join(reportDir, "report.json"),
      JSON.stringify(data, null, 2) + "\n",
      { mode: 0o600 },
    ),
    fs.writeFile(path.join(reportDir, "report.csv"), rendered.csv, {
      mode: 0o600,
    }),
    fs.writeFile(
      path.join(reportDir, "report.md"),
      rendered.markdown +
        `\n## Publishing pipeline\n\n${jobs || "No scheduled jobs in this period."}\n`,
      { mode: 0o600 },
    ),
    fs.writeFile(path.join(reportDir, "report.html"), rendered.html, {
      mode: 0o600,
    }),
  ]);
  state.lastReportWeek = end;
  await save();
  console.log(`Weekly report: ${path.join(reportDir, "report.html")}`);
}
async function finishDelivery(job: Job) {
  const log = path.join(job.directory, "delivery.log");
  if (!job.commit) throw new Error("Missing content commit");
  // Pushing an existing immutable commit is retryable without model calls.
  await run("git", ["fetch", "origin", "main"], job.worktree, log, 120_000);
  let alreadyPushed = false;
  try {
    await run(
      "git",
      ["merge-base", "--is-ancestor", job.commit, "origin/main"],
      job.worktree,
      undefined,
      60_000,
    );
    alreadyPushed = true;
  } catch {}
  if (!alreadyPushed)
    await run(
      "git",
      ["push", "origin", `${job.commit}:refs/heads/main`],
      job.worktree,
      log,
      120_000,
    );
  job.status = "deploying";
  await save();
  await waitForDeployment({
    readRuns: async () =>
      JSON.parse(
        await run(
          "gh",
          [
            "run",
            "list",
            "--repo",
            "eloqdata/lavik-agent",
            "--commit",
            job.commit!,
            "--workflow",
            "ci.yml",
            "--limit",
            "3",
            "--json",
            "status,conclusion,url",
          ],
          root,
          undefined,
          60_000,
        ),
      ),
    onRun: async (current) => {
      job.runUrl = current.url;
      await save();
    },
  });
  const prepared = JSON.parse(
    await fs.readFile(path.join(job.directory, "prepared.json"), "utf8"),
  );
  // Run this verifier in the isolated checkout so it uses that publication's implementation.
  await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/verify-publication.ts",
      path.join(job.directory, "prepared.json"),
    ],
    job.worktree,
    log,
    120_000,
  );
  job.status = "published";
  job.error = undefined;
  job.publishedAt = new Date().toISOString();
  job.urls = prepared.record.editions.map(
    (e: { path: string }) => `https://lavik.dev${e.path}`,
  );
  await save();
  console.log(`Published ${job.id}: ${job.urls!.join(" ")}`);
}
async function blog(force = false) {
  if (config.automaticWebsitePublication !== true)
    throw new Error(
      "Automatic website publication is disabled in the marketing schedule",
    );
  const pending = state.jobs.find((j) =>
    ["prepared", "publishing", "deploying"].includes(j.status),
  );
  if (pending) {
    await finishDelivery(pending);
    return;
  }
  const interrupted = state.jobs.find((j) => j.status === "writing");
  if (interrupted) {
    interrupted.status = "needs_attention";
    interrupted.error =
      "Previous writer process stopped. Inspect saved attempts before retrying; no automatic model restart.";
    await save();
    throw new Error(interrupted.error);
  }
  if (
    !force &&
    (state.paused || !config.enabled || state.nextBlogDate > localDay())
  )
    return;
  const date = localDay(),
    id = `lavik-field-notes-${date}`,
    topic =
      config.topicRotation[state.jobs.length % config.topicRotation.length];
  if (state.jobs.some((j) => j.id === id))
    throw new Error(
      "A job already exists for today; inspect its state instead of creating a duplicate",
    );
  const taskDir = path.join(directory, "tasks", id),
    worktree = path.join(directory, "worktrees", id);
  await fs.mkdir(taskDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.dirname(worktree), { recursive: true, mode: 0o700 });
  const job: Job = {
    id,
    date,
    brief: `${topic} Find a specific fresh angle not covered by existing articles. If the evidence cannot support a worthwhile new article, return a blocked review rather than fill the schedule with repetition.`,
    status: "writing",
    directory: taskDir,
    worktree,
  };
  state.jobs.push(job);
  state.nextBlogDate = addDays(date, config.blogIntervalDays);
  await save();
  const log = path.join(taskDir, "runner.log");
  try {
    await run("git", ["fetch", "origin", "main"], root, log, 120_000);
    await run(
      "git",
      ["worktree", "add", "--detach", worktree, "origin/main"],
      root,
      log,
      60_000,
    );
    // Install the exact reviewed lock in this checkout; never reuse a possibly
    // different installation from the owner's working tree.
    await run(
      "npm",
      ["ci", "--include=dev", "--no-audit", "--no-fund"],
      worktree,
      log,
      10 * 60_000,
    );
    await run(
      process.execPath,
      ["scripts/verify-marketing-install.mjs"],
      worktree,
      log,
      60_000,
    );
    // The cache contains public verified artifacts; private keys and .env are never copied.
    await fs.symlink(
      path.join(root, ".cache"),
      path.join(worktree, ".cache"),
      "dir",
    );
    await run("npm", ["run", "content:check"], worktree, log, 60_000);
    await run("npm", ["run", "verify:prepare"], worktree, log, 10 * 60_000);
    await run(
      process.execPath,
      ["--import", "tsx", "scripts/blog-task.ts", taskDir, id, job.brief],
      worktree,
      log,
      45 * 60_000,
    );
    const prepared = JSON.parse(
      await fs.readFile(path.join(taskDir, "prepared.json"), "utf8"),
    );
    if (
      !Array.isArray(prepared.files) ||
      prepared.files.some(
        (f: string) =>
          !new RegExp(
            `^(content/(en|zh-CN)/${id}\\.json|evidence/reviews/(en|zh-CN)-${id}\\.json|evidence/publications/[a-f0-9-]{36}/[a-zA-Z0-9.-]+\\.json)$`,
          ).test(f),
      )
    )
      throw new Error("Publication contains unexpected files");
    await run("npm", ["run", "check"], worktree, log, 15 * 60_000);
    await run("git", ["add", "--", ...prepared.files], worktree, log, 60_000);
    const staged = (
      await run(
        "git",
        ["diff", "--cached", "--name-only"],
        worktree,
        undefined,
        60_000,
      )
    ).split("\n");
    if (staged.some((f) => !prepared.files.includes(f)))
      throw new Error("Unexpected staged file; publication stopped");
    await run(
      "git",
      ["commit", "-m", `Publish reviewed bilingual blog: ${id}`],
      worktree,
      log,
      60_000,
    );
    job.commit = await run(
      "git",
      ["rev-parse", "HEAD"],
      worktree,
      undefined,
      60_000,
    );
    job.status = "prepared";
    await save();
    await finishDelivery(job);
  } catch (error) {
    job.error = (error as Error).message;
    if (!job.commit) job.status = "needs_attention";
    await save();
    throw error;
  }
}
try {
  if (command === "pause" || command === "resume") {
    state.paused = command === "pause";
    await save();
    console.log(
      state.paused
        ? "Blog generation paused; reports remain available."
        : "Blog generation resumed.",
    );
  } else if (command === "check") {
    console.log(
      await run(process.execPath, ["--version"], root, undefined, 30_000),
    );
    console.log(
      await run(
        process.execPath,
        ["scripts/verify-marketing-install.mjs"],
        root,
        undefined,
        30_000,
      ),
    );
    console.log(
      "Coordinator supervision and installed tools passed; no model or publication task was started.",
    );
  } else if (command === "report") await report();
  else if (command === "run-now") await blog(true);
  else if (command === "tick") {
    if (state.lastReportWeek !== weekStart())
      try {
        await report();
      } catch (e) {
        console.error(`Weekly report pending: ${(e as Error).message}`);
      }
    if (!state.paused && config.enabled) await blog();
  } else
    throw new Error(
      "Use status, check, tick, run-now, pause, resume, recover, report, or link PATH SOURCE CAMPAIGN",
    );
} finally {
  ownership.release();
}
