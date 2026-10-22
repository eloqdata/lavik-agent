import { Fragment } from "react";
import Link from "next/link";
import type { Article } from "../../../packages/content/schema";
import { technicalPublicationErrors } from "../../../packages/blog/technical-publication";
import "./technical-article.css";
import { defaultDocVersion } from "../../../packages/docs/versions";

export function TechnicalArticleBody({ article }: { article: Article }) {
  const errors = technicalPublicationErrors(article);
  if (errors.length) throw new Error(errors.join("\n"));
  const { sources, visuals } = article.technical!;
  const zh = article.locale === "zh-CN";
  const citations = (ids: string[]) => (
    <span className="technical-citations">
      {ids.map((id) => {
        const index = sources.findIndex((s) => s.id === id);
        return (
          <a
            key={id}
            href={`#source-${id}`}
            aria-label={`${zh ? "来源" : "Source"} ${index + 1}: ${sources[index].title}`}
          >
            [{index + 1}]
          </a>
        );
      })}
    </span>
  );
  return (
    <div className="technical-article">
      <nav
        className="technical-toc"
        aria-label={zh ? "本文内容" : "In this article"}
      >
        <p>{zh ? "本文内容" : "IN THIS ARTICLE"}</p>
        <ol>
          {article.blocks.map((block, i) =>
            block.type === "heading" ? (
              <li key={i}>
                <a href={`#section-${i}`}>{block.text}</a>
              </li>
            ) : null,
          )}
        </ol>
      </nav>
      <div className="prose">
        {article.blocks.map((block, i) => (
          <Fragment key={i}>
            {block.type === "heading" ? (
              <h2 id={`section-${i}`}>{block.text}</h2>
            ) : block.type === "paragraph" ? (
              <p>
                {block.text}
                {citations(block.sources)}
              </p>
            ) : null}
            {visuals
              .filter((visual) => visual.afterBlock === i)
              .map((visual) =>
                visual.type === "table" ? (
                  <figure
                    className="technical-figure"
                    key={visual.id}
                    id={visual.id}
                  >
                    <div
                      className="technical-table-scroll"
                      role="region"
                      aria-label={visual.caption}
                      tabIndex={0}
                    >
                      <table>
                        <caption>{visual.caption}</caption>
                        <thead>
                          <tr>
                            {visual.columns.map((column, n) => (
                              <th scope="col" key={n}>
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {visual.rows.map((row, n) => (
                            <tr key={n}>
                              {row.map((cell, j) =>
                                j === 0 ? (
                                  <th scope="row" key={j}>
                                    {cell}
                                  </th>
                                ) : (
                                  <td key={j}>{cell}</td>
                                ),
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <figcaption>
                      {zh ? "来源与计算依据" : "Sources and calculation inputs"}
                      {citations(visual.sources)}
                    </figcaption>
                  </figure>
                ) : (
                  <figure
                    className="technical-figure"
                    key={visual.id}
                    id={visual.id}
                  >
                    <img
                      src={visual.src}
                      alt={visual.alt}
                      width={visual.width}
                      height={visual.height}
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption>
                      {visual.caption}
                      {citations(visual.sources)}
                    </figcaption>
                  </figure>
                ),
              )}
          </Fragment>
        ))}
      </div>
      <aside className="technical-next">
        <h2>{zh ? "从自己的数据集开始" : "Start with your dataset"}</h2>
        <p>
          {zh
            ? `安装 Lavik ${defaultDocVersion}，回放真实负载，再用 RedisShake 规划迁移。`
            : `Install Lavik ${defaultDocVersion}, replay your workload, and plan the migration with RedisShake.`}
        </p>
        <div>
          <Link
            className="button primary"
            href={`/${article.locale}/docs/${defaultDocVersion}/quick-start/`}
          >
            {zh ? "开始使用" : "Get started"} →
          </Link>
          <Link
            href={`/${article.locale}/docs/${defaultDocVersion}/migrate-redis/`}
          >
            {zh ? "RedisShake 迁移指南" : "RedisShake migration guide"} →
          </Link>
          <Link href={`/${article.locale}/benchmarks/`}>
            {zh ? "完整基准与复现步骤" : "Benchmarks and reproduction steps"} →
          </Link>
        </div>
      </aside>
      <aside className="source-list technical-sources">
        <h2>{zh ? "参考资料" : "References"}</h2>
        <ol>
          {sources.map((source) => (
            <li id={`source-${source.id}`} key={source.id}>
              <a href={source.url}>{source.title} ↗</a>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
