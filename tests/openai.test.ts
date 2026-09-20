import test from "node:test";
import assert from "node:assert/strict";
import { openAIConfig } from "../packages/agents/config.ts";
import { createOpenAIRuntime } from "../packages/agents/openai.ts";
import {
  articles,
  harnessHash,
  recipeHash,
  renderingHash,
} from "../packages/content/repository.ts";
import type { Article } from "../packages/content/schema.ts";

const azureEnv = {
  OPENAI_API_KEY: "azure-test-key",
  OPENAI_BASE_URL: "https://test-resource.services.ai.azure.com/openai/v1/",
  LAVIK_WRITER_MODEL: "writer-astra-deployment",
  LAVIK_REVIEWER_MODEL: "reviewer-astra-deployment",
  LAVIK_WRITER_REASONING_EFFORT: "xhigh",
  LAVIK_REVIEWER_REASONING_EFFORT: "high",
  LAVIK_WRITER_MAX_TOKENS: "32000",
  LAVIK_REVIEWER_MAX_TOKENS: "16000",
  LAVIK_AGENT_TIMEOUT_MS: "900000",
};

test("Azure requests use the configured endpoint, deployment names and role reasoning settings", async (t) => {
  const article: Article = {
    ...articles().find((a) => a.locale === "en")!,
    blocks: [
      {
        type: "paragraph",
        text: "Test benchmark paragraph",
        sources: ["benchmark-spdk"],
      },
      { type: "claim", claimId: "storage-model" },
      { type: "calculation", calculationId: "capacity-economics" },
    ],
  };
  const requests: {
    url: string;
    authorization: string | null;
    body: Record<string, any>;
  }[] = [];
  let reviewCalls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init);
      const body = JSON.parse(await request.text());
      requests.push({
        url: request.url,
        authorization: request.headers.get("authorization"),
        body,
      });
      // Any accidental trace upload or fallback request fails before reaching a network.
      assert.equal(request.url, `${azureEnv.OPENAI_BASE_URL}responses`);
      const reviewing = body.model === azureEnv.LAVIK_REVIEWER_MODEL;
      const readSource = reviewing && reviewCalls++ === 0;
      const output = readSource
        ? [
            {
              type: "function_call",
              id: "fc_read_source",
              call_id: "call_read_source",
              name: "read_source",
              arguments: JSON.stringify({
                sourceIds: ["benchmark-spdk", "storage"],
              }),
              status: "completed",
            },
          ]
        : [
            {
              id: `msg_${requests.length}`,
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  annotations: [],
                  text: JSON.stringify(
                    reviewing
                      ? { verdict: "pass", findings: [], checkedSourceIds: [] }
                      : article,
                  ),
                },
              ],
            },
          ];
      return new Response(
        JSON.stringify({
          id: `resp_${requests.length}`,
          object: "response",
          created_at: 1,
          status: "completed",
          model: body.model,
          output,
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  );

  const events: { type: string; data: Record<string, unknown> }[] = [];
  const runtime = createOpenAIRuntime(azureEnv, async (type, data) => {
    events.push({ type, data });
  });
  const written = await runtime.write(
    { brief: "A test brief", locale: "en", feedback: [] },
    async () => {
      throw new Error(
        "No verification recipe was requested in this transport test",
      );
    },
  );
  assert.deepEqual(written, article);
  const reviewed = await runtime.review(written, []);
  assert.deepEqual(reviewed, {
    verdict: "pass",
    findings: [],
    checkedSourceIds: ["benchmark-spdk", "storage"],
  });
  assert.equal(requests.length, 3);
  for (const request of requests) {
    const writing = request.body.model === azureEnv.LAVIK_WRITER_MODEL;
    assert.equal(request.authorization, "Bearer azure-test-key");
    assert.equal(
      request.body.model,
      writing ? azureEnv.LAVIK_WRITER_MODEL : azureEnv.LAVIK_REVIEWER_MODEL,
    );
    assert.equal(request.body.reasoning.effort, writing ? "xhigh" : "high");
    assert.equal(request.body.max_output_tokens, writing ? 32000 : 16000);
    assert.equal(request.body.parallel_tool_calls, false);
    assert.equal(request.body.text.format.type, "json_schema");
  }
  assert.match(JSON.stringify(requests[2].body.input), /22 new Lavik points/);
  const reviewInput = requests[1].body.input.find(
    (message: any) => message.role === "user",
  ).content;
  const payload = JSON.parse(
    typeof reviewInput === "string" ? reviewInput : reviewInput[0].text,
  );
  const context = JSON.parse(payload.context);
  assert.deepEqual(
    context.claims.map((claim: any) => claim.id),
    ["storage-model"],
  );
  const required = ["benchmark-spdk", "readme", "storage", "tiering-cost"];
  assert.deepEqual(context.requiredSourceIds.sort(), required);
  assert.deepEqual(
    context.sources.map((source: any) => source.id).sort(),
    required,
  );
  assert.equal(context.blockDefinitions.renderingHash, renderingHash());
  assert.equal(
    context.blockDefinitions.expectedRecipeHashes["basic-commands"],
    recipeHash("basic-commands"),
  );
  assert.equal(context.blockDefinitions.expectedHarnessHash, harnessHash());
  assert.match(
    context.blockDefinitions.harnessFiles["verification/start.sh"],
    /--shutdown-checkpoint/,
  );
  assert.match(
    context.blockDefinitions.files["apps/web/components/cost-calculator.tsx"],
    /useState\(20\)/,
  );
  assert.equal(openAIConfig(azureEnv).tracingDisabled, true);
  const completed = events.filter(
    (event) => event.type === "model-run-completed",
  );
  assert.equal(completed.length, 2);
  assert.equal((completed[0].data.usage as { requests: number }).requests, 1);
  assert.equal(
    (completed[1].data.usage as { totalTokens: number }).totalTokens,
    60,
  );
  assert.deepEqual(completed[1].data.inspectedSourceIds, [
    "benchmark-spdk",
    "storage",
  ]);
  assert.ok(events.some((event) => event.type === "source-inspected"));
  assert.ok(!JSON.stringify(events).includes(azureEnv.OPENAI_API_KEY));
});

test("live provider failures emit a failure event without a completion or credentials", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "DeploymentNotFound",
            message: "Deployment test-missing not found",
          },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
  );
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const runtime = createOpenAIRuntime(azureEnv, async (type, data) => {
    events.push({ type, data });
  });
  await assert.rejects(
    runtime.write({ brief: "Test", locale: "en", feedback: [] }, async () => {
      throw new Error("No verification expected");
    }),
    /test-missing/,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["model-run-started", "model-run-failed"],
  );
  assert.ok(!JSON.stringify(events).includes(azureEnv.OPENAI_API_KEY));
});

test("invalid endpoints and settings fail before creating a model run", () => {
  for (const endpoint of [
    `${azureEnv.OPENAI_BASE_URL}responses`,
    `${azureEnv.OPENAI_BASE_URL}responses/`,
    `${azureEnv.OPENAI_BASE_URL}?api-key=example`,
  ])
    assert.throws(
      () => openAIConfig({ ...azureEnv, OPENAI_BASE_URL: endpoint }),
      /API base URL/,
    );
  assert.throws(
    () => openAIConfig({ ...azureEnv, OPENAI_API_KEY: "" }),
    /OPENAI_API_KEY/,
  );
  assert.throws(
    () => openAIConfig({ ...azureEnv, LAVIK_WRITER_REASONING_EFFORT: "xhgh" }),
    /REASONING_EFFORT/,
  );
  assert.throws(
    () => openAIConfig({ ...azureEnv, LAVIK_REVIEWER_MAX_TOKENS: "-1" }),
    /MAX_TOKENS/,
  );
  assert.throws(
    () => openAIConfig({ ...azureEnv, LAVIK_AGENT_TIMEOUT_MS: "NaN" }),
    /TIMEOUT_MS/,
  );
});

test("blank optional settings preserve direct OpenAI defaults", () => {
  const config = openAIConfig({
    OPENAI_API_KEY: "test-key",
    OPENAI_BASE_URL: "",
    LAVIK_WRITER_MODEL: "gpt-6-astra",
    LAVIK_REVIEWER_MODEL: "gpt-6-astra",
    LAVIK_WRITER_REASONING_EFFORT: "",
    LAVIK_REVIEWER_REASONING_EFFORT: "",
    LAVIK_AGENT_TIMEOUT_MS: "",
  });
  assert.equal(config.baseURL, "https://api.openai.com/v1/");
  assert.equal(config.tracingDisabled, false);
  assert.equal(config.writer.modelSettings.reasoning, undefined);
  assert.equal(config.writer.modelSettings.maxTokens, 5000);
  assert.equal(config.reviewer.modelSettings.maxTokens, 2500);
  assert.equal(config.timeoutMs, 240000);
});

test("runtime identity tracks endpoint, reasoning and budgets but never the key", () => {
  const identity = createOpenAIRuntime(azureEnv).identity;
  assert.ok(!identity.includes(azureEnv.OPENAI_API_KEY));
  assert.equal(
    createOpenAIRuntime({ ...azureEnv, OPENAI_API_KEY: "rotated-key" })
      .identity,
    identity,
  );
  for (const change of [
    {
      OPENAI_BASE_URL:
        "https://other-resource.services.ai.azure.com/openai/v1/",
    },
    { LAVIK_WRITER_REASONING_EFFORT: "medium" },
    { LAVIK_REVIEWER_MODEL: "other-deployment" },
    { LAVIK_REVIEWER_MAX_TOKENS: "32000" },
    { LAVIK_AGENT_TIMEOUT_MS: "240000" },
  ])
    assert.notEqual(
      createOpenAIRuntime({ ...azureEnv, ...change }).identity,
      identity,
    );
});
