import {
  articles,
  contentHash,
  knowledgeHash,
  release,
} from "../packages/content/repository.ts";
import { storedReceipt } from "../packages/content/gate.ts";
import {
  publicationPolicyHash,
  publicationRenderingHash,
} from "../packages/content/publication-context.ts";
import type { TaskResult } from "../packages/admin/contracts.ts";

export function publicationResult(id: string): TaskResult {
  return {
    runtime: "independent-review:test-private-endpoint-do-not-publish",
    knowledgeHash: knowledgeHash(),
    sourceCommit: release.commit,
    completedAt: new Date().toISOString(),
    publicationContext: {
      rendererVersion: 2,
      policyHash: publicationPolicyHash(),
      baseContentHashes: { en: null, "zh-CN": null },
    },
    editions: (["en", "zh-CN"] as const).map((locale) => {
      const article = structuredClone(
        articles().find((a) => a.id === "quick-start" && a.locale === locale)!,
      );
      article.id = article.slug = `publication-${id.slice(0, 8)}`;
      article.blocks = [
        {
          type: "paragraph",
          text:
            locale === "en"
              ? "Check the command results for the pinned release."
              : "检查固定版本的命令执行结果。",
          sources: ["readme"],
        },
        { type: "recipe", recipeId: "basic-commands" },
      ];
      return {
        article,
        contentHash: contentHash(article),
        renderingHash: publicationRenderingHash(),
        receipts: [structuredClone(storedReceipt("basic-commands"))],
        review: {
          verdict: "pass" as const,
          findings: [],
          checkedSourceIds: ["readme"],
        },
      };
    }),
  };
}
