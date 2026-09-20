import fs from "node:fs/promises";
import path from "node:path";
import {
  articleSchema,
  reviewSchema,
  receiptSchema,
  type Article,
  type Locale,
  type Receipt,
  type Review,
} from "../content/schema.ts";
import {
  claims,
  contentHash,
  hash,
  knowledgeHash,
  readText,
  renderingHash,
  root,
} from "../content/repository.ts";
import { validateArticle } from "../content/gate.ts";

export interface AgentRuntime {
  write(
    input: {
      brief: string;
      locale: Locale;
      feedback: string[];
      previous?: Article;
      kind?: "blog" | "docs";
    },
    verify: (id: string) => Promise<Receipt>,
  ): Promise<Article>;
  review(
    article: Article,
    receipts: Receipt[],
    context?: { feedback: string[] },
  ): Promise<Review>;
  identity: string;
}
export type Edition = {
  article: Article;
  review: Review;
  receipts: Receipt[];
  contentHash: string;
  reviewPending?: boolean;
  renderingHash?: string;
};
export type CampaignState = {
  schemaVersion: 1;
  id: string;
  brief: string;
  fingerprint: string;
  status: "running" | "blocked" | "ready" | "published";
  editions: Partial<Record<Locale, Edition>>;
  attempts: Record<Locale, number>;
  errors: string[];
  runtime: string;
};
export const policy = JSON.parse(
  readText("policies/operating-policy.json"),
) as {
  maxRevisionAttempts: number;
  maxTurnsPerAgent: number;
  enabledChannels: string[];
  automaticPublishing: boolean;
};
export const workflowFingerprint = () =>
  hash(
    JSON.stringify({
      knowledge: knowledgeHash(),
      policy,
      recipes: readText("verification/recipes.json"),
      writer: readText("policies/writer.md"),
      reviewer: readText("policies/reviewer.md"),
      writerRole: readText("policies/blog-writer.md"),
      reviewerRole: readText("policies/blog-reviewer.md"),
    }),
  );
export function campaignPath(id: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(id))
    throw new Error(
      "Campaign ID must be 1–81 lowercase letters, numbers or hyphens",
    );
  return path.join(root, ".runs", id);
}
export async function saveState(state: CampaignState) {
  const directory = campaignPath(state.id);
  await fs.mkdir(directory, { recursive: true });
  const target = path.join(directory, "state.json");
  await fs.writeFile(target + ".tmp", JSON.stringify(state, null, 2) + "\n");
  await fs.rename(target + ".tmp", target);
}
export async function event(id: string, type: string, data: unknown) {
  await fs.appendFile(
    path.join(campaignPath(id), "events.jsonl"),
    JSON.stringify({ at: new Date().toISOString(), type, data }) + "\n",
  );
}
export async function withCampaignLock<T>(
  id: string,
  action: () => Promise<T>,
) {
  const directory = campaignPath(id);
  await fs.mkdir(directory, { recursive: true });
  const lock = await fs.open(path.join(directory, ".lock"), "wx").catch(() => {
    throw new Error(
      `Campaign ${id} is locked. Confirm no writer/publisher is running before removing .runs/${id}/.lock.`,
    );
  });
  try {
    await lock.writeFile(`${process.pid}\n`);
    return await action();
  } finally {
    await lock.close();
    await fs.unlink(path.join(directory, ".lock"));
  }
}
export async function runCampaign(
  id: string,
  brief: string,
  runtime: AgentRuntime,
  verifier: (id: string) => Promise<Receipt>,
): Promise<CampaignState> {
  return withCampaignLock(id, async () => {
    let state: CampaignState;
    try {
      state = JSON.parse(
        await fs.readFile(path.join(campaignPath(id), "state.json"), "utf8"),
      );
      if (
        state.fingerprint !== workflowFingerprint() ||
        state.brief !== brief ||
        state.runtime !== runtime.identity
      )
        throw new Error(
          "Campaign inputs changed. Start a new campaign ID to preserve its evidence history.",
        );
      if (state.status === "published") return state;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      state = {
        schemaVersion: 1,
        id,
        brief,
        fingerprint: workflowFingerprint(),
        status: "running",
        editions: {},
        attempts: { en: 0, "zh-CN": 0 },
        errors: [],
        runtime: runtime.identity,
      };
    }
    state.status = "running";
    await saveState(state);
    try {
      for (const locale of ["en", "zh-CN"] as const) {
        if (
          state.editions[locale]?.review.verdict === "pass" &&
          !state.editions[locale]?.reviewPending
        ) {
          const previous = state.editions[locale]!;
          const errors = validateArticle(previous.article, (id) =>
            previous.receipts.find((r) => r.recipeId === id)!,
          );
          if (
            errors.length ||
            contentHash(previous.article) !== previous.contentHash ||
            previous.renderingHash !== renderingHash()
          )
            throw new Error(
              `Saved ${locale} evidence is stale: ${errors.join("; ")}`,
            );
          continue;
        }
        let feedback: string[] = [
          ...new Set([
            ...(state.editions[locale]?.review.findings ?? []),
            ...state.errors,
          ]),
        ];
        let previous = state.editions[locale]?.article;
        while (
          state.editions[locale]?.reviewPending ||
          state.attempts[locale] <= policy.maxRevisionAttempts
        ) {
          let draft = state.editions[locale];
          if (!draft?.reviewPending) {
            state.attempts[locale]++;
            await saveState(state); // Record budget consumption before a provider call.
            const captured = new Map<string, Receipt>();
            const verify = async (recipeId: string) => {
              if (captured.has(recipeId)) return captured.get(recipeId)!;
              const receipt = receiptSchema.parse(await verifier(recipeId));
              captured.set(recipeId, receipt);
              await event(id, "verification", receipt);
              return receipt;
            };
            const article = articleSchema.parse(
              await runtime.write(
                { brief, locale, feedback, previous },
                verify,
              ),
            );
            if (article.locale !== locale)
              throw new Error("Writer returned the wrong language");
            if (article.kind !== "blog")
              throw new Error(
                "Initial autonomous workflow publishes blog articles only; versioned reference docs use source-audited changes",
              );
            // Stable campaign identity prevents agent-selected paths or overwriting docs.
            article.id = id;
            article.slug = id;
            for (const block of article.blocks)
              if (block.type === "recipe") await verify(block.recipeId);
            draft = {
              article,
              receipts: [...captured.values()],
              contentHash: contentHash(article),
              review: {
                verdict: "revise",
                findings: ["Independent review pending"],
                checkedSourceIds: [],
              },
              reviewPending: true,
            };
            state.editions[locale] = draft;
            // Keep completed writing and execution even if the review provider fails.
            await saveState(state);
            await event(id, "draft-checkpointed", {
              locale,
              attempt: state.attempts[locale],
              ...draft,
            });
          }
          if (contentHash(draft.article) !== draft.contentHash)
            throw new Error(`Saved ${locale} draft changed before review`);
          const article = draft.article;
          const receipts = new Map(
            draft.receipts.map((receipt) => [
              receipt.recipeId,
              receiptSchema.parse(receipt),
            ]),
          );
          const checks = validateArticle(article, (id) => receipts.get(id)!);
          const reviewedRenderingHash = renderingHash();
          // Fresh reviewer input; the writer's reasoning is not used as evidence.
          const review = checks.length
            ? {
                verdict: "revise" as const,
                findings: checks,
                checkedSourceIds: [],
              }
            : reviewSchema.parse(
                await runtime.review(article, [...receipts.values()]),
              );
          const cited = new Set(
            article.blocks.flatMap((b) =>
              b.type === "paragraph"
                ? b.sources
                : b.type === "claim"
                  ? (claims.find((c) => c.id === b.claimId)?.sources ?? [])
                  : b.type === "calculation"
                    ? ["tiering-cost"]
                    : [],
            ),
          );
          if (review.verdict === "pass" && review.findings.length)
            review.verdict = "revise";
          if (
            review.verdict === "pass" &&
            [...cited].some(
              (source) => !review.checkedSourceIds.includes(source),
            )
          ) {
            review.verdict = "revise";
            review.findings.push("Reviewer did not inspect every cited source");
          }
          state.editions[locale] = {
            article,
            review,
            receipts: [...receipts.values()],
            contentHash: contentHash(article),
            reviewPending: false,
            renderingHash: reviewedRenderingHash,
          };
          await event(id, "edition", {
            locale,
            attempt: state.attempts[locale],
            ...state.editions[locale],
          });
          await saveState(state);
          if (review.verdict === "pass") {
            state.errors = [];
            break;
          }
          feedback = review.findings;
          previous = article;
          state.errors = feedback;
          if (review.verdict === "blocked") break;
        }
        if (state.editions[locale]?.review.verdict !== "pass") {
          state.status = "blocked";
          state.errors = state.editions[locale]?.review.findings ?? [
            "Writing budget exhausted",
          ];
          await saveState(state);
          return state;
        }
      }
      state.status = "ready";
      state.errors = [];
      await saveState(state);
      await event(id, "ready", { fingerprint: state.fingerprint });
      return state;
    } catch (error) {
      state.status = "blocked";
      state.errors = [error instanceof Error ? error.message : String(error)];
      await saveState(state);
      await event(id, "blocked", state.errors);
      return state;
    }
  });
}
