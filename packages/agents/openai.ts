import {
  Agent,
  ModelBehaviorError,
  OpenAIProvider,
  Runner,
  tool,
} from "@openai/agents";
import { z } from "zod";
import {
  articleSchema,
  reviewSchema,
  type Article,
  type Receipt,
} from "../content/schema.ts";
import {
  claims,
  hash,
  harnessFiles,
  harnessHash,
  readText,
  recipes,
  recipeHash,
  release,
  renderingFiles,
  renderingHash,
  sourceText,
  sources,
} from "../content/repository.ts";
import { estimateCost } from "../content/economics.ts";
import { policy, type AgentRuntime } from "./workflow.ts";
import { openAIConfig } from "./config.ts";

const costTool = () =>
  tool({
    name: "calculate_cost",
    description:
      "Calculate a conditional capacity-cost scenario. Inputs must share currency and time basis. The result is arithmetic, not an observed SLA or a sourced price quote.",
    parameters: z.object({
      dramPerGiB: z.number().positive(),
      ssdPerGiB: z.number().positive(),
      datasetGiB: z.number().positive(),
      indexFraction: z.number().min(0).max(1),
      storageAmplification: z.number().min(1),
      sharedCost: z.number().min(0),
    }),
    execute: async (input) =>
      JSON.stringify({
        inputs: input,
        result: estimateCost(input),
        scope:
          "Conditional model; match replica count, performance, durability and service boundary separately.",
      }),
  });
type RuntimeEvent = (
  type: string,
  data: Record<string, unknown>,
) => Promise<void>;
type ErrorCause = {
  name: string;
  message: string;
  code?: string;
  cause?: ErrorCause;
};
function errorCause(error: unknown): ErrorCause | undefined {
  const cause = (error as { cause?: unknown })?.cause;
  if (!(cause instanceof Error)) return undefined;
  return {
    name: cause.name,
    message: cause.message,
    code: (cause as Error & { code?: string }).code,
    cause: errorCause(cause),
  };
}
const sourceTool = (
  inspected: Set<string>,
  observed: (sourceId: string) => Promise<void>,
) =>
  tool({
    name: "read_source",
    description:
      "Read checksum-verified primary evidence. Request relevant source IDs together in one batch. When requiredSourceIds are supplied, read every one. Inspect the returned texts before writing or reaching a verdict.",
    parameters: z.object({
      sourceIds: z.array(z.string()).min(1).max(sources.length),
    }),
    execute: async ({ sourceIds }) => {
      const results = [];
      for (const sourceId of new Set(sourceIds)) {
        const text = sourceText(sourceId);
        inspected.add(sourceId);
        await observed(sourceId);
        results.push({ sourceId, text });
      }
      return JSON.stringify(results);
    },
  });
const context = (article?: Article) => {
  const usedClaims = article
    ? claims.filter((claim) =>
        article.blocks.some(
          (block) => block.type === "claim" && block.claimId === claim.id,
        ),
      )
    : claims;
  const required = new Set([
    ...usedClaims.flatMap((claim) => claim.sources),
    ...(article?.blocks.flatMap((block) =>
      block.type === "paragraph"
        ? block.sources
        : block.type === "calculation"
          ? ["tiering-cost"]
          : [],
    ) ?? []),
  ]);
  return JSON.stringify({
    release,
    sources: sources
      .filter(({ id }) => !article || required.has(id))
      .map(({ id, title, url }) => ({ id, title, url })),
    claims: usedClaims,
    ...(article ? { requiredSourceIds: [...required] } : {}),
    recipes,
    blockDefinitions: {
      renderingHash: renderingHash(),
      files: Object.fromEntries(
        renderingFiles.map((file) => [file, readText(file)]),
      ),
      expectedRecipeHashes: Object.fromEntries(
        recipes.map((recipe) => [recipe.id, recipeHash(recipe.id)]),
      ),
      expectedHarnessHash: harnessHash(),
      harnessFiles: Object.fromEntries(
        harnessFiles.map((file) => [file, readText(file)]),
      ),
    },
    currentDate: new Date().toISOString().slice(0, 10),
  });
};

export function createOpenAIRuntime(
  env: Record<string, string | undefined> = process.env,
  observed: RuntimeEvent = async () => undefined,
  signal?: AbortSignal,
): AgentRuntime {
  const { apiKey, ...config } = openAIConfig(env);
  const runner = new Runner({
    modelProvider: new OpenAIProvider({
      apiKey,
      baseURL: config.baseURL,
      useResponses: true,
      useResponsesWebSocket: false,
    }),
    tracingDisabled: config.tracingDisabled,
  });
  return {
    identity: `openai-agents:${config.writer.model}:${config.reviewer.model}:v2:${hash(JSON.stringify(config))}`,
    async write(input, verify) {
      const kind = input.kind ?? "blog";
      const details = {
        role: "writer",
        locale: input.locale,
        model: config.writer.model,
      };
      await observed("model-run-started", details);
      const inspected = new Set<string>();
      const agent = new Agent({
        name:
          kind === "docs" ? "Lavik user manual writer" : "Lavik blog writer",
        model: config.writer.model,
        instructions:
          readText("policies/writer.md") +
          "\n" +
          readText(`policies/${kind === "docs" ? "manual" : "blog"}-writer.md`),
        outputType: articleSchema,
        modelSettings: config.writer.modelSettings,
        tools: [
          sourceTool(inspected, async (sourceId) =>
            observed("source-inspected", { ...details, sourceId }),
          ),
          costTool(),
          tool({
            name: "verify_example",
            description:
              "Run a registered example against the real pinned Lavik binary in isolated Linux. Returns actual command results; failed/unavailable is never proof of success.",
            parameters: z.object({ recipeId: z.string() }),
            execute: async ({ recipeId }) =>
              JSON.stringify(await verify(recipeId)),
          }),
        ],
      });
      const run = (formatRetry: boolean) =>
        runner
          .run(
            agent,
            JSON.stringify({
              ...input,
              feedback: formatRetry
                ? [
                    ...input.feedback,
                    "The previous response failed article schema validation. Return a complete article object matching the supplied JSON schema, including its exact block types, required fields, identifiers and length limits. Keep all factual verification requirements.",
                  ]
                : input.feedback,
              context: context(),
            }),
            {
              maxTurns: policy.maxTurnsPerAgent,
              signal: signal
                ? AbortSignal.any([
                    signal,
                    AbortSignal.timeout(config.timeoutMs),
                  ])
                : AbortSignal.timeout(config.timeoutMs),
            },
          )
          .catch(async (error) => {
            await observed("model-run-failed", {
              ...details,
              error: error instanceof Error ? error.message : String(error),
              cause: errorCause(error),
              usage: error?.state?.usage,
            });
            throw error;
          });
      let result;
      try {
        result = await run(false);
      } catch (error) {
        // A malformed draft never reaches review or publication. Give the writer
        // one fresh attempt; authentication, refusal and tool failures still fail.
        if (
          !(error instanceof ModelBehaviorError) ||
          !error.message.startsWith("Invalid output type:")
        )
          throw error;
        signal?.throwIfAborted();
        await observed("writer-format-retry", details);
        result = await run(true);
      }
      await observed("model-run-completed", {
        ...details,
        usage: result.state.usage,
        inspectedSourceIds: [...inspected],
      });
      return articleSchema.parse(result.finalOutput);
    },
    async review(
      article: Article,
      receipts: Receipt[],
      reviewContext?: { feedback: string[] },
    ) {
      const details = {
        role: "reviewer",
        locale: article.locale,
        model: config.reviewer.model,
      };
      await observed("model-run-started", details);
      const inspected = new Set<string>();
      const reviewer = new Agent({
        name:
          article.kind === "docs"
            ? "Lavik user manual reviewer"
            : "Lavik blog reviewer",
        model: config.reviewer.model,
        instructions:
          readText("policies/reviewer.md") +
          "\n" +
          readText(
            `policies/${article.kind === "docs" ? "manual" : "blog"}-reviewer.md`,
          ),
        outputType: reviewSchema,
        modelSettings: config.reviewer.modelSettings,
        tools: [
          sourceTool(inspected, async (sourceId) =>
            observed("source-inspected", { ...details, sourceId }),
          ),
          costTool(),
        ],
      });
      const result = await runner
        .run(
          reviewer,
          JSON.stringify({
            article,
            receipts,
            context: context(article),
            feedback: reviewContext?.feedback ?? [],
          }),
          {
            maxTurns: policy.maxTurnsPerAgent,
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
              : AbortSignal.timeout(config.timeoutMs),
          },
        )
        .catch(async (error) => {
          await observed("model-run-failed", {
            ...details,
            error: error instanceof Error ? error.message : String(error),
            cause: errorCause(error),
            usage: error?.state?.usage,
          });
          throw error;
        });
      await observed("model-run-completed", {
        ...details,
        usage: result.state.usage,
        inspectedSourceIds: [...inspected],
      });
      const review = reviewSchema.parse(result.finalOutput);
      // Trust actual tool execution, not the model's assertion that it read sources.
      review.checkedSourceIds = [...inspected];
      return review;
    },
  };
}
