import fs from "node:fs/promises";
import path from "node:path";
import {
  resultSchema,
  roles,
  type Task,
  type TaskResult,
} from "./contracts.ts";
import { artifactHash } from "./artifact-id.ts";
import {
  articles,
  articlePath,
  contentHash,
  hash,
  knowledgeHash,
  readJson,
  release,
  root,
  sources,
} from "../content/repository.ts";
import { checkReceipt, validateArticle } from "../content/gate.ts";
import { blogPresentation } from "../blog/presentation.ts";
import {
  publicationPolicyHash,
  publicationRenderingHash,
} from "../content/publication-context.ts";

export class PublicationBlocked extends Error {}
type Candidate = Pick<Task, "id" | "role" | "articleId" | "result">;
export type PublicationRecord = {
  schemaVersion: 1;
  taskId: string;
  artifactHash: string;
  editions: {
    locale: "en" | "zh-CN";
    id: string;
    contentHash: string;
    path: string;
    receiptHashes: Record<string, string>;
  }[];
};
export async function validatePublication(
  task: Candidate,
  expectedHash: string,
): Promise<TaskResult> {
  const reject = (message: string): never => {
    throw new PublicationBlocked(message);
  };
  if (!/^[a-f0-9-]{36}$/.test(task.id)) reject("Invalid publication identity");
  const result = resultSchema.parse(task.result);
  if ((await artifactHash(result)) !== expectedHash)
    reject("The reviewed artifact changed; request a new review.");
  const policy = readJson("policies/operating-policy.json") as {
    automaticPublishing: boolean;
    enabledChannels: string[];
  };
  if (
    !policy.automaticPublishing ||
    !policy.enabledChannels.includes("website")
  )
    reject("Automatic website publication is disabled by policy.");
  if (result.publicationContext?.rendererVersion !== 2)
    reject(
      "This draft predates publication evidence binding. Request a revision or fresh review.",
    );
  if (result.publicationContext!.policyHash !== publicationPolicyHash())
    reject("Publication policy changed since review. Request a new review.");
  if (
    result.knowledgeHash !== knowledgeHash() ||
    result.sourceCommit !== release.commit
  )
    reject("Sources or release changed since review. Request a new review.");
  if (
    result.editions.length !== 2 ||
    new Set(result.editions.map((e) => e.article.locale)).size !== 2
  )
    reject("Both reviewed language editions are required.");
  const first = result.editions[0].article;
  for (const edition of result.editions) {
    const { article, review, receipts } = edition;
    if (
      article.kind !== roles.find((r) => r.id === task.role)?.kind ||
      article.id !== first.id ||
      article.slug !== first.slug ||
      article.version !== first.version ||
      !/^[a-z0-9][a-z0-9-]{0,80}$/.test(article.id) ||
      !/^[a-z0-9][a-z0-9-]{0,80}$/.test(article.slug) ||
      (task.articleId && task.articleId !== article.id)
    )
      reject(
        "Publication identity, languages or destination do not match the reviewed task.",
      );
    if (
      edition.contentHash !== contentHash(article) ||
      edition.renderingHash !== publicationRenderingHash()
    )
      reject("Content or rendering changed after review.");
    if (review.verdict !== "pass" || review.findings.length)
      reject("Independent review has unresolved findings.");
    const errors = validateArticle(article, (id) =>
      receipts.find((receipt) => receipt.recipeId === id)!,
    );
    for (const receipt of receipts)
      errors.push(...checkReceipt(receipt, receipt.recipeId));
    if (errors.length)
      reject(`Publication evidence failed: ${errors.join("; ")}`);
    if (
      article.kind === "blog" &&
      JSON.stringify(blogPresentation(article)) !==
        JSON.stringify(blogPresentation(first))
    )
      reject("Blog translations must share topics and artwork.");
    // ValidateArticle checks support; this additionally proves the reviewer read it.
    const claims = readJson("content/claims.json") as {
      id: string;
      sources: string[];
    }[];
    const cited = article.blocks.flatMap((b) =>
      b.type === "paragraph"
        ? b.sources
        : b.type === "claim"
          ? (claims.find((c) => c.id === b.claimId)?.sources ?? [])
          : b.type === "calculation"
            ? ["tiering-cost"]
            : [],
    );
    if (cited.some((id) => !review.checkedSourceIds.includes(id)))
      reject("The reviewer did not inspect every cited source.");
  }
  return result;
}

export async function preparePublication(
  task: Candidate,
  expectedHash: string,
  directory = root,
) {
  const result = await validatePublication(task, expectedHash);
  const pages =
    directory === root
      ? articles()
      : (
          await Promise.all(
            ["en", "zh-CN"].map(async (locale) => {
              const names = await fs
                .readdir(path.join(directory, "content", locale))
                .catch(() => [] as string[]);
              return Promise.all(
                names
                  .filter((n) => n.endsWith(".json"))
                  .map(async (name) =>
                    JSON.parse(
                      await fs.readFile(
                        path.join(directory, "content", locale, name),
                        "utf8",
                      ),
                    ),
                  ),
              );
            }),
          )
        ).flat();
  const record: PublicationRecord = {
    schemaVersion: 1,
    taskId: task.id,
    artifactHash: expectedHash,
    editions: result.editions.map(({ article, receipts }) => ({
      locale: article.locale,
      id: article.id,
      contentHash: contentHash(article),
      path: articlePath(article),
      receiptHashes: Object.fromEntries(
        receipts.map((receipt) => [
          receipt.recipeId,
          hash(JSON.stringify(receipt)),
        ]),
      ),
    })),
  };
  const writes: { file: string; data: unknown; immutable: boolean }[] = [];
  for (const edition of result.editions) {
    const { article } = edition;
    const existing = pages.find(
      (p) => p.id === article.id && p.locale === article.locale,
    );
    const actualHash = existing ? contentHash(existing) : null;
    const baseHash =
      result.publicationContext!.baseContentHashes[article.locale];
    if (actualHash !== baseHash && actualHash !== edition.contentHash)
      throw new PublicationBlocked(
        "The destination changed after writing began. Request a revision against the latest article.",
      );
    if (
      existing &&
      (existing.kind !== article.kind ||
        existing.slug !== article.slug ||
        existing.version !== article.version)
    )
      throw new PublicationBlocked(
        "Publication would move an existing article to a different destination.",
      );
    if (
      pages.some(
        (p) => p.id !== article.id && articlePath(p) === articlePath(article),
      )
    )
      throw new PublicationBlocked("Another article already uses this URL.");
    const reviewFile = `evidence/reviews/${article.locale}-${article.id}.json`;
    const previousReview = await fs
      .readFile(path.join(directory, reviewFile), "utf8")
      .then(JSON.parse)
      .catch(() => undefined);
    const recorded = await fs
      .stat(
        path.join(directory, `evidence/publications/${task.id}/manifest.json`),
      )
      .then(() => true)
      .catch(() => false);
    if (
      recorded &&
      previousReview?.publicationId &&
      previousReview.publicationId !== task.id
    )
      throw new PublicationBlocked(
        "A newer publication replaced this article. This attempt will not overwrite it.",
      );
    for (const receipt of edition.receipts)
      writes.push({
        file: `evidence/publications/${task.id}/${article.locale}-${receipt.recipeId}.json`,
        data: receipt,
        immutable: true,
      });
    writes.push({
      file: reviewFile,
      immutable: false,
      data: {
        method: "agent-review",
        reviewer: `Lavik independent reviewer; runtime sha256:${hash(result.runtime)}`,
        verdict: "pass",
        contentHash: edition.contentHash,
        releaseCommit: result.sourceCommit,
        knowledgeHash: result.knowledgeHash,
        renderingHash: edition.renderingHash,
        rendererVersion: 2,
        policyHash: result.publicationContext!.policyHash,
        sourceHashes: Object.fromEntries(sources.map((s) => [s.id, s.sha256])),
        checkedSourceIds: edition.review.checkedSourceIds,
        publicationId: task.id,
        artifactHash: expectedHash,
      },
    });
    writes.push({
      file: `content/${article.locale}/${article.id}.json`,
      data: article,
      immutable: false,
    });
  }
  writes.push({
    file: `evidence/publications/${task.id}/manifest.json`,
    data: record,
    immutable: true,
  });
  // Validate all immutable paths before touching any file. Git commits both
  // editions atomically; interrupted local preparation is repeatable.
  for (const write of writes.filter((w) => w.immutable)) {
    const existing = await fs
      .readFile(path.join(directory, write.file), "utf8")
      .catch((error) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      });
    if (existing && existing !== JSON.stringify(write.data, null, 2) + "\n")
      throw new PublicationBlocked(
        "An immutable publication artifact already exists with different contents.",
      );
  }
  for (const write of writes) {
    const file = path.join(directory, write.file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(write.data, null, 2) + "\n");
  }
  return { record, files: writes.map((w) => w.file) };
}

export async function verifyLivePublication(
  record: PublicationRecord,
  http: typeof fetch = fetch,
) {
  const response = await http(
    `https://lavik.dev/publication-manifest.json?artifact=${record.artifactHash}`,
    {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status !== 200)
    throw new Error("The deployed publication manifest is not available yet.");
  const manifest = (await response.json()) as {
    publications: PublicationRecord[];
  };
  if (
    !manifest.publications?.some(
      (p) =>
        p.taskId === record.taskId &&
        p.artifactHash === record.artifactHash &&
        JSON.stringify(p.editions) === JSON.stringify(record.editions),
    )
  )
    throw new Error(
      "The deployed artifact does not match this reviewed publication yet.",
    );
  for (const edition of record.editions) {
    const page = await http(
      `https://lavik.dev${edition.path}?artifact=${edition.contentHash}`,
      {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (
      page.status !== 200 ||
      !(await page.text()).includes(
        `data-content-hash="${edition.contentHash}"`,
      )
    )
      throw new Error(
        "A live language edition does not match the reviewed content yet.",
      );
  }
}
