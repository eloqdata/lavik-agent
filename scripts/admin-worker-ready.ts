import fs from "node:fs/promises";
import { articles } from "../packages/content/repository.ts";

// Probe the durable queue before downloading the release and preparing Docker.
// This never claims work or invokes a model.
const token = process.env.LAVIK_RUNNER_TOKEN;
if (!token || token.length < 32) throw new Error("Set LAVIK_RUNNER_TOKEN");
const response = await fetch("https://lavik.dev/api/runner/check", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    runnerId: `github-${process.env.GITHUB_RUN_ID}`,
    model: process.env.LAVIK_WRITER_MODEL ?? "unconfigured",
    reviewerModel: process.env.LAVIK_REVIEWER_MODEL ?? "unconfigured",
    runUrl: `https://github.com/eloqdata/lavik-agent/actions/runs/${process.env.GITHUB_RUN_ID}`,
    catalog: articles()
      .filter((a) => a.locale === "en" && ["docs", "blog"].includes(a.kind))
      .map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        version: a.version,
      })),
  }),
  signal: AbortSignal.timeout(20000),
});
if (!response.ok)
  throw new Error(`Admin queue check failed (${response.status})`);
const { ready } = (await response.json()) as { ready: boolean };
if (process.env.GITHUB_OUTPUT)
  await fs.appendFile(process.env.GITHUB_OUTPUT, `ready=${ready === true}\n`);
console.log(
  ready ? "Queued work is ready." : "No task is ready; worker heartbeat saved.",
);
