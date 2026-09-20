import {
  articleSchema,
  receiptSchema,
  reviewSchema,
  type Article,
  type Receipt,
  type Review,
} from "../content/schema.ts";
import {
  articles,
  claims,
  contentHash,
  knowledgeHash,
  release,
  sources,
} from "../content/repository.ts";
import { validateArticle } from "../content/gate.ts";
import { policy, type AgentRuntime } from "../agents/workflow.ts";
import { roles, type Role, type Task, type TaskResult } from "./contracts.ts";
import {
  publicationPolicyHash,
  publicationRenderingHash,
} from "../content/publication-context.ts";

type Progress = {
  stage: string;
  activeRole: Role;
  result?: TaskResult;
  event?: { type: string; message: string; data?: Record<string, unknown> };
};
export async function executeTask(
  task: Task,
  runtime: AgentRuntime,
  verifier: (id: string) => Promise<Receipt>,
  progress: (value: Progress) => Promise<void>,
  previous?: TaskResult,
  ownerFeedback: string[] = [],
  signal?: AbortSignal,
): Promise<TaskResult> {
  const role = roles.find((r) => r.id === task.role)!;
  const reviewerRole: Role =
    role.kind === "docs" ? "manual-reviewer" : "blog-reviewer";
  const result: TaskResult = {
    publicationContext: {
      rendererVersion: 2,
      policyHash: publicationPolicyHash(),
      baseContentHashes: { en: null, "zh-CN": null },
    },
    references: {
      claims: Object.fromEntries(claims.map((claim) => [claim.id, claim.text])),
      sources: Object.fromEntries(
        sources.map((source) => [source.id, source.url]),
      ),
    },
    editions: [],
    runtime: runtime.identity,
    knowledgeHash: knowledgeHash(),
    sourceCommit: release.commit,
    completedAt: new Date().toISOString(),
  };
  const snapshot = articles();
  let identity = task.articleId ?? previous?.editions[0]?.article.id;
  let destinationSlug = task.articleId
    ? snapshot.find((page) => page.id === task.articleId)?.slug
    : previous?.editions[0]?.article.slug;
  for (const locale of ["en", "zh-CN"] as const) {
    signal?.throwIfAborted();
    let article = previous?.editions.find(
      (e) => e.article.locale === locale,
    )?.article;
    if (!article && task.articleId)
      article = articles().find(
        (a) =>
          a.id === task.articleId &&
          a.locale === locale &&
          a.kind === role.kind,
      );
    if (task.articleId && !article)
      throw new Error(
        `No ${locale} ${role.kind} article named ${task.articleId}`,
      );
    if (article && article.kind !== role.kind)
      throw new Error("The selected article does not match this agent's role");
    if (role.work === "reviewer" && !article)
      throw new Error(
        "Review tasks require an existing article or a saved draft",
      );
    let feedback = [
      ...ownerFeedback,
      ...(previous?.editions.find((e) => e.article.locale === locale)?.review
        .findings ?? []),
    ];
    for (
      let attempt = 0;
      attempt <= (role.work === "writer" ? policy.maxRevisionAttempts : 0);
      attempt++
    ) {
      signal?.throwIfAborted();
      const captured = new Map<string, Receipt>();
      const verify = async (id: string) => {
        signal?.throwIfAborted();
        if (!captured.has(id)) {
          const receipt = receiptSchema.parse(await verifier(id));
          captured.set(id, receipt);
          await progress({
            stage: `Verifying commands · ${locale}`,
            activeRole: task.role,
            event: {
              type: "verification",
              message: `${id}: ${receipt.status}`,
              data: {
                recipeId: id,
                status: receipt.status,
                platform: receipt.platform,
              },
            },
          });
        }
        return captured.get(id)!;
      };
      if (role.work === "writer") {
        await progress({
          stage: `Writing ${locale} · attempt ${attempt + 1}`,
          activeRole: task.role,
          event: {
            type: "writing",
            message: `Writing ${locale}, attempt ${attempt + 1}`,
          },
        });
        article = articleSchema.parse(
          await runtime.write(
            {
              brief: task.brief,
              locale,
              kind: role.kind,
              previous: article,
              feedback,
              rendererVersion: 2,
            },
            verify,
          ),
        );
        if (article.locale !== locale || article.kind !== role.kind)
          throw new Error("Writer returned the wrong language or article kind");
        if (!identity) {
          identity = article.slug.slice(0, 70);
          if (snapshot.some((page) => page.id === identity))
            identity += `-${task.id.slice(0, 8)}`;
        }
        article.id = identity;
        destinationSlug ??= article.id;
        article.slug = destinationSlug;
      }
      const original = snapshot.find(
        (page) => page.id === article!.id && page.locale === locale,
      );
      result.publicationContext!.baseContentHashes[locale] = original
        ? contentHash(original)
        : null;
      for (const block of article!.blocks)
        if (block.type === "recipe") await verify(block.recipeId);
      const receipts = [...captured.values()];
      const edition = {
        article: article!,
        receipts,
        contentHash: contentHash(article!),
        renderingHash: publicationRenderingHash(),
        review: {
          verdict: "revise" as const,
          findings: ["Independent review pending"],
          checkedSourceIds: [] as string[],
        },
      };
      result.editions = result.editions.filter(
        (e) => e.article.locale !== locale,
      );
      result.editions.push(edition);
      await progress({
        stage: `Reviewing ${locale}`,
        activeRole: reviewerRole,
        result,
        event: {
          type: "draft-saved",
          message: `${locale} draft and execution receipts saved`,
        },
      });
      const validation = validateArticle(article!, (id) => captured.get(id)!);
      let review: Review = validation.length
        ? { verdict: "blocked", findings: validation, checkedSourceIds: [] }
        : reviewSchema.parse(
            await runtime.review(article!, receipts, {
              feedback: [task.brief, ...ownerFeedback],
              rendererVersion: 2,
            }),
          );
      const cited = article!.blocks.flatMap((b) =>
        b.type === "paragraph"
          ? b.sources
          : b.type === "claim"
            ? (claims.find((c) => c.id === b.claimId)?.sources ?? [])
            : b.type === "calculation"
              ? ["tiering-cost"]
              : [],
      );
      if (
        review.verdict === "pass" &&
        cited.some((id) => !review.checkedSourceIds.includes(id))
      )
        review = {
          ...review,
          verdict: "revise",
          findings: [
            ...review.findings,
            "Reviewer did not inspect every cited source",
          ],
        };
      if (review.verdict === "pass" && review.findings.length)
        review.verdict = "revise";
      result.editions[result.editions.length - 1] = { ...edition, review };
      await progress({
        stage: `${locale}: ${review.verdict}`,
        activeRole: reviewerRole,
        result,
        event: {
          type: "review",
          message: `${locale}: ${review.verdict}`,
          data: { findings: review.findings },
        },
      });
      if (review.verdict !== "revise" || role.work === "reviewer") break;
      feedback = [...ownerFeedback, ...review.findings];
    }
  }
  result.completedAt = new Date().toISOString();
  return result;
}
