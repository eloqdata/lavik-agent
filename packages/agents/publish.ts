import fs from "node:fs/promises";
import path from "node:path";
import {
  articleSchema,
  receiptSchema,
  reviewSchema,
} from "../content/schema.ts";
import {
  claims,
  contentHash,
  knowledgeHash,
  release,
  renderingHash,
  root,
  sources,
} from "../content/repository.ts";
import { validateArticle } from "../content/gate.ts";
import { blogPresentation } from "../blog/presentation.ts";
import {
  campaignPath,
  event,
  policy,
  saveState,
  withCampaignLock,
  workflowFingerprint,
  type CampaignState,
} from "./workflow.ts";

async function writeOnce(file: string, value: unknown) {
  const serialized = JSON.stringify(value, null, 2) + "\n";
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.writeFile(file, serialized, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if ((await fs.readFile(file, "utf8")) !== serialized)
      throw new Error(
        `Publication would overwrite a different artifact: ${path.relative(root, file)}`,
      );
  }
}
export async function publishCampaign(id: string) {
  return withCampaignLock(id, () =>
    withCampaignLock("system-publication-lock", async () => {
      if (
        !policy.automaticPublishing ||
        !policy.enabledChannels.includes("website")
      )
        throw new Error("Website publishing is disabled by policy");
      const state: CampaignState = JSON.parse(
        await fs.readFile(path.join(campaignPath(id), "state.json"), "utf8"),
      );
      if (state.id !== id || !["ready", "published"].includes(state.status))
        throw new Error("Campaign is not ready for publication");
      if (state.fingerprint !== workflowFingerprint())
        throw new Error(
          "Sources or policy changed; start a fresh verification run",
        );
      // Validate BOTH editions before writing either. A partial interrupted write is
      // recoverable by retry: existing identical files are accepted, changes rejected.
      for (const locale of ["en", "zh-CN"] as const) {
        const edition = state.editions[locale];
        if (!edition) throw new Error(`Missing ${locale} edition`);
        articleSchema.parse(edition.article);
        reviewSchema.parse(edition.review);
        if (
          edition.article.locale !== locale ||
          edition.article.id !== id ||
          edition.article.slug !== id ||
          edition.article.kind !== "blog"
        )
          throw new Error("Publication identity or destination mismatch");
        if (
          edition.contentHash !== contentHash(edition.article) ||
          edition.renderingHash !== renderingHash() ||
          edition.reviewPending ||
          edition.review.verdict !== "pass" ||
          edition.review.findings.length
        )
          throw new Error("Review failed or content changed after review");
        const cited = edition.article.blocks.flatMap((b) =>
          b.type === "paragraph"
            ? b.sources
            : b.type === "claim"
              ? (claims.find((c) => c.id === b.claimId)?.sources ?? [])
              : b.type === "calculation"
                ? ["tiering-cost"]
                : [],
        );
        if (
          cited.some(
            (source) => !edition.review.checkedSourceIds.includes(source),
          )
        )
          throw new Error(
            "Independent reviewer did not inspect every cited source",
          );
        const receipts = edition.receipts.map((r) => receiptSchema.parse(r));
        const errors = validateArticle(edition.article, (id) =>
          receipts.find((r) => r.recipeId === id)!,
        );
        if (errors.length) throw new Error(errors.join("; "));
      }
      if (
        JSON.stringify(blogPresentation(state.editions.en!.article)) !==
        JSON.stringify(blogPresentation(state.editions["zh-CN"]!.article))
      )
        throw new Error("Blog translations must share topics and artwork.");
      for (const locale of ["en", "zh-CN"] as const) {
        const edition = state.editions[locale]!;
        // Receipts stay in a campaign-specific record as well as the current recipe record.
        for (const receipt of edition.receipts) {
          await writeOnce(
            path.join(
              root,
              "evidence/runs",
              id,
              `${locale}-${receipt.recipeId}.json`,
            ),
            receipt,
          );
          await fs.mkdir(path.join(root, "evidence/verification"), {
            recursive: true,
          });
          await fs.writeFile(
            path.join(
              root,
              "evidence/verification",
              `${receipt.recipeId}.json`,
            ),
            JSON.stringify(receipt, null, 2) + "\n",
          );
        }
        await writeOnce(
          path.join(root, "evidence/reviews", `${locale}-${id}.json`),
          {
            method: "agent-review",
            reviewer: state.runtime,
            verdict: "pass",
            contentHash: edition.contentHash,
            releaseCommit: release.commit,
            knowledgeHash: knowledgeHash(),
            renderingHash: edition.renderingHash,
            sourceHashes: Object.fromEntries(
              sources.map((s) => [s.id, s.sha256]),
            ),
            checkedSourceIds: edition.review.checkedSourceIds,
            campaignId: id,
          },
        );
      }
      for (const locale of ["en", "zh-CN"] as const)
        await writeOnce(
          path.join(root, "content", locale, `${id}.json`),
          state.editions[locale]!.article,
        );
      state.status = "published";
      await saveState(state);
      await event(id, "published-to-content-repository", {
        en: `content/en/${id}.json`,
        zh: `content/zh-CN/${id}.json`,
      });
      return state;
    }),
  );
}
