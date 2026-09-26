import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { requireReviewedManual } from "../../../packages/manual/gate";
import {
  operationSnippet,
  operationsGuides,
  type OperationsGuide,
} from "../../../packages/operations/repository";
import { DocsSidebar } from "./docs-sidebar";
import { CopyCode } from "./copy-code";
import "./operations.css";

function Inline({ children }: { children: string }) {
  return (
    <>
      {children
        .split(/(`[^`]+`)/g)
        .map((part, i) =>
          part.startsWith("`") ? (
            <code key={i}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </>
  );
}
export function OperationsPage({
  locale,
  guide,
}: {
  locale: Locale;
  guide: OperationsGuide;
}) {
  const publication = requireReviewedManual();
  const zh = locale === "zh-CN";
  const root = `/${locale}/docs/0.1.0`;
  const other = operationsGuides.find((g) => g.id !== guide.id)!;
  return (
    <main
      id="main"
      className="container document-layout operations-guide"
      data-manual-hash={publication.bundleHash}
    >
      <DocsSidebar locale={locale} route={`docs/0.1.0/${guide.id}`} />
      <article className="document">
        <div className="breadcrumb">
          <Link href={`${root}/`}>Lavik Docs</Link>
          <span>/</span>
          <span>lavik-ctl</span>
        </div>
        <p className="eyebrow">LAVIK-CTL · 0.1.0-BETA.1</p>
        <h1>{guide.title[locale]}</h1>
        <p className="document-summary">{guide.summary[locale]}</p>
        <p className="article-meta">
          {zh
            ? "文档版本 0.1.0 · 固定发布版 v0.1.0-beta.1"
            : "Documentation 0.1.0 · pinned release v0.1.0-beta.1"}
        </p>
        <nav
          className="operations-toc"
          aria-label={zh ? "本页内容" : "On this page"}
        >
          {guide.sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              {s.title[locale]}
            </a>
          ))}
        </nav>
        <div className="prose">
          {guide.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="operations-section"
            >
              <h2>{section.title[locale]}</h2>
              {section.blocks.map((block, i) => {
                switch (block.type) {
                  case "paragraph":
                    return (
                      <p key={i}>
                        <Inline>{block.text[locale]}</Inline>
                      </p>
                    );
                  case "snippet":
                    return (
                      <div key={i} data-operator-snippet={block.name}>
                        <CopyCode
                          locale={locale}
                          code={operationSnippet(block.name)}
                        />
                      </div>
                    );
                  case "link":
                    return (
                      <p key={i}>
                        <Link href={block.href.replaceAll("{locale}", locale)}>
                          {block.label[locale]} →
                        </Link>
                      </p>
                    );
                  case "list":
                    return (
                      <ul key={i}>
                        {block.items.map((item, n) => (
                          <li key={n}>
                            <Inline>{item[locale]}</Inline>
                          </li>
                        ))}
                      </ul>
                    );
                  case "table":
                    return (
                      <div key={i} className="operations-table">
                        <table>
                          <thead>
                            <tr>
                              {block.headers.map((h, n) => (
                                <th key={n} scope="col">
                                  {h[locale]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, n) => (
                              <tr key={n}>
                                {row.map((cell, j) => (
                                  <td key={j}>
                                    <Inline>{cell[locale]}</Inline>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  case "promql":
                    return (
                      <div key={i}>
                        <p className="eyebrow">PromQL</p>
                        <pre>
                          <code>{block.text}</code>
                        </pre>
                      </div>
                    );
                }
              })}
            </section>
          ))}
        </div>
        <Link className="operations-next" href={`${root}/${other.id}/`}>
          <span>{zh ? "继续阅读" : "Continue reading"}</span>
          <strong>{other.title[locale]} →</strong>
        </Link>
      </article>
    </main>
  );
}
