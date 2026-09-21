import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  codexArguments,
  subscriptionEnvironment,
  runLocalCodex,
} from "../packages/local/codex.ts";

test("an explicit third review cannot exceed the four-call task budget", async () => {
  const taskDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "lavik-codex-budget-"),
  );
  try {
    for (const role of ["writer-1", "writer-2", "reviewer-1", "reviewer-2"])
      await fs.mkdir(path.join(taskDirectory, role));
    await assert.rejects(
      runLocalCodex({
        role: "reviewer",
        taskDirectory,
        prompt: "Never sent",
        schema: {},
        additionalReviewReason: "Budget test",
      }),
      /total invocation budget exhausted/,
    );
    assert.deepEqual(
      await fs.readdir(path.join(taskDirectory, "reviewer-3")),
      [],
    );
  } finally {
    await fs.rm(taskDirectory, { recursive: true, force: true });
  }
});

test("subscription launcher strips API keys, Azure endpoints and publishing credentials", () => {
  assert.deepEqual(
    subscriptionEnvironment({
      PATH: "/bin",
      HOME: "/home/test",
      OPENAI_API_KEY: "forbidden",
      OPENAI_BASE_URL: "https://azure.invalid",
      AZURE_OPENAI_API_KEY: "forbidden",
      CODEX_API_KEY: "forbidden",
      GITHUB_TOKEN: "forbidden",
      CLOUDFLARE_API_TOKEN: "forbidden",
    }),
    { PATH: "/bin", HOME: "/home/test", NODE_ENV: "production" },
  );
});

test("writer and reviewer force ChatGPT and ignore global provider settings", () => {
  for (const role of ["writer", "reviewer"] as const) {
    const args = codexArguments(role, "/tmp/manual");
    for (const value of [
      "--ignore-user-config",
      'model_provider="openai"',
      'forced_login_method="chatgpt"',
      "features.shell_tool=false",
      "features.unified_exec=false",
      'web_search="disabled"',
      "read-only",
      "--ephemeral",
    ])
      assert.ok(args.includes(value));
    assert.ok(
      args.includes(
        `model_reasoning_effort="${role === "writer" ? "medium" : "high"}"`,
      ),
    );
  }
});
