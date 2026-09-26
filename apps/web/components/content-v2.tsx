// Renderer v2 binds the displayed command record to the reviewed article.
// Documentation hides audit details; publication validation still checks receipts.
import {
  claims,
  readText,
  recipes,
  release,
  sources,
} from "../../../packages/content/repository";
import type { Receipt } from "../../../packages/content/schema";
import type { Article, Locale } from "../../../packages/content/schema";
import { CostCalculator } from "./cost-calculator";

const shellArg = (value: string) =>
  /^[a-zA-Z0-9:./_-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
export function RecipeBlock({
  id,
  locale,
  receipt,
  showEvidence = true,
}: {
  id: string;
  locale: Locale;
  receipt: Receipt;
  showEvidence?: boolean;
}) {
  const recipe = recipes.find((r) => r.id === id)!;
  const zh = locale === "zh-CN";
  return (
    <section className="recipe">
      <h2>{recipe.title[locale]}</h2>
      <p>{recipe.prerequisites[locale]}</p>
      <div className="code-label">
        {zh ? "终端 1 · 启动服务器" : "Terminal 1 · Start the server"}
      </div>
      <pre>
        <code>
          {readText("verification/start.sh")
            .split("\n")
            .filter((line) => !line.startsWith("#"))
            .join("\n")
            .trim()}
        </code>
      </pre>
      <div className="code-label">
        {zh
          ? "终端 2 · 命令与预期结果"
          : "Terminal 2 · Commands and expected output"}
      </div>
      <pre>
        <code>
          {recipe.steps
            .map((s) => `$ ${s.argv.map(shellArg).join(" ")}\n${s.expected}`)
            .join("\n\n")}
        </code>
      </pre>
      {showEvidence && (
        <details className="verification">
          <summary>
            {receipt.status === "passed" ? "✓" : "!"}{" "}
            {zh ? "查看实际执行记录" : "View actual execution record"}
          </summary>
          <p>
            {receipt.release} · {receipt.platform} ·{" "}
            {receipt.completedAt.slice(0, 10)}
          </p>
          <p>
            {zh
              ? "此记录验证功能行为，不验证 NVMe 性能、断电持久性或 SLA。"
              : "This record checks functional behavior, not NVMe performance, power-loss durability, or an SLA."}
          </p>
          <pre>
            <code>{JSON.stringify(JSON.parse(receipt.output), null, 2)}</code>
          </pre>
        </details>
      )}
    </section>
  );
}
export function ArticleBody({
  article,
  receipts,
}: {
  article: Article;
  receipts: Receipt[];
}) {
  const showEvidence = !["docs", "faq"].includes(article.kind);
  const used = new Set<string>();
  for (const block of article.blocks) {
    if (block.type === "paragraph") block.sources.forEach((id) => used.add(id));
    if (block.type === "claim")
      claims
        .find((c) => c.id === block.claimId)
        ?.sources.forEach((id) => used.add(id));
    if (block.type === "calculation") used.add("tiering-cost");
  }
  return (
    <>
      <div className="prose">
        {article.blocks.map((block, i) => {
          if (block.type === "heading") return <h2 key={i}>{block.text}</h2>;
          if (block.type === "paragraph") return <p key={i}>{block.text}</p>;
          if (block.type === "claim")
            return (
              <p
                key={i}
                className={
                  block.claimId === "benchmark-scope" ||
                  block.claimId === "durability"
                    ? "context-note"
                    : ""
                }
              >
                {
                  claims.find((c) => c.id === block.claimId)!.text[
                    article.locale
                  ]
                }
              </p>
            );
          if (block.type === "calculation")
            return <CostCalculator key={i} locale={article.locale} />;
          return (
            <RecipeBlock
              key={i}
              id={block.recipeId}
              locale={article.locale}
              showEvidence={showEvidence}
              receipt={receipts.find((r) => r.recipeId === block.recipeId)!}
            />
          );
        })}
      </div>
      {showEvidence && (
        <aside className="source-list">
          <h2>
            {article.locale === "en" ? "Sources for this page" : "本页资料来源"}
          </h2>
          <p>
            {article.locale === "en" ? "Source snapshot" : "资料快照"}:{" "}
            {article.sourceRevision ? "" : `${release.tag} · `}
            <a
              href={`https://github.com/eloqdata/lavik/tree/${article.sourceRevision ?? release.commit}`}
            >
              {(article.sourceRevision ?? release.commit).slice(0, 7)}
            </a>
          </p>
          {article.sourceRevision ? (
            <p>
              {article.locale === "en"
                ? "Engineering notes based on this repository snapshot. Consult the versioned manual for the downloadable beta's verified behavior."
                : "本文工程分析基于此仓库快照。下载的 beta 版本已验证行为请查阅版本化手册。"}
            </p>
          ) : null}
          <ul>
            {[...used].map((id) => {
              const source = sources.find((s) => s.id === id)!;
              return (
                <li key={id}>
                  <a href={source.url}>{source.title} ↗</a>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </>
  );
}
