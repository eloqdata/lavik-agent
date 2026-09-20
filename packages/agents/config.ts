import { z } from "zod";
import type { ModelSettings } from "@openai/agents";

const effortSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export function openAIConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const required = (name: string) => {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Set ${name}. No model calls have been made.`);
    return value;
  };
  const positiveInteger = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      throw new Error(`${name} must be a positive integer below 2147483648.`);
    return value;
  };
  const baseURL = new URL(
    env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1/",
  );
  if (
    !["http:", "https:"].includes(baseURL.protocol) ||
    baseURL.username ||
    baseURL.password ||
    baseURL.search ||
    baseURL.hash ||
    /\/(responses|chat\/completions)\/?$/.test(baseURL.pathname)
  )
    throw new Error(
      "OPENAI_BASE_URL must be an API base URL, such as https://RESOURCE.services.ai.azure.com/openai/v1/, without /responses, credentials, or query parameters.",
    );
  if (!baseURL.pathname.endsWith("/")) baseURL.pathname += "/";

  const role = (name: "WRITER" | "REVIEWER", defaultTokens: number) => {
    const model = required(`LAVIK_${name}_MODEL`);
    const rawEffort = env[`LAVIK_${name}_REASONING_EFFORT`]?.trim();
    const effort = rawEffort ? effortSchema.safeParse(rawEffort) : undefined;
    if (effort && !effort.success)
      throw new Error(
        `LAVIK_${name}_REASONING_EFFORT must be none, minimal, low, medium, high, xhigh, or max (and supported by the deployment).`,
      );
    const modelSettings: ModelSettings = {
      maxTokens: positiveInteger(`LAVIK_${name}_MAX_TOKENS`, defaultTokens),
      parallelToolCalls: false,
      ...(effort?.success ? { reasoning: { effort: effort.data } } : {}),
    };
    return { model, modelSettings };
  };
  return {
    apiKey: required("OPENAI_API_KEY"),
    baseURL: baseURL.href,
    // Azure credentials cannot authenticate to OpenAI's tracing service.
    // Campaign evidence continues to be recorded locally by the workflow.
    tracingDisabled: baseURL.origin !== "https://api.openai.com",
    writer: role("WRITER", 5000),
    reviewer: role("REVIEWER", 2500),
    timeoutMs: positiveInteger("LAVIK_AGENT_TIMEOUT_MS", 240_000),
  };
}
