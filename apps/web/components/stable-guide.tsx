import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { readText } from "../../../packages/content/repository";
import { requireStableDocs } from "../../../packages/docs/gate";
import {
  stablePackages,
  type StableGuide,
} from "../../../packages/docs/stable";
import { quickStartDependencies } from "../../../packages/quick-start/content";
import { DocsSidebar } from "./docs-sidebar";
import { CopyCode } from "./copy-code";
import { QuickStartInstaller } from "./quick-start-installer";
import "./operations.css";
import "./quick-start.css";

function Inline({ children }: { children: string }) {
  return (
    <>
      {children
        .split(/(`[^`]+`)/g)
        .map((part, index) =>
          part.startsWith("`") ? (
            <code key={index}>{part.slice(1, -1)}</code>
          ) : (
            part
          ),
        )}
    </>
  );
}
export function StableGuidePage({
  locale,
  guide,
  releaseNote = false,
}: {
  locale: Locale;
  guide: StableGuide;
  releaseNote?: boolean;
}) {
  const publication = requireStableDocs();
  const zh = locale === "zh-CN";
  return (
    <main
      id="main"
      className="container document-layout operations-guide"
      data-doc-version="0.1.0"
      data-manual-hash={publication.bundleHash}
    >
      <DocsSidebar
        locale={locale}
        route={releaseNote ? "releases/0-1-0" : `docs/0.1.0/${guide.id}`}
      />
      <article className="document">
        <div className="breadcrumb">
          <Link href={`/${locale}/${releaseNote ? "releases" : "docs/0.1.0"}/`}>
            {releaseNote ? (zh ? "版本说明" : "Release Notes") : "Lavik Docs"}
          </Link>
          <span>/</span>
          <span>0.1.0</span>
        </div>
        <h1>{guide.title[locale]}</h1>
        <p className="document-summary">{guide.summary[locale]}</p>
        <p className="article-meta">
          v0.1.0 · {zh ? "稳定版" : "Stable"}
          {releaseNote ? " · 2026-10-13" : ""}
        </p>
        {(guide.id === "quick-start" || releaseNote) && (
          <div className="download-box">
            <Link href={`/${locale}/download/`}>
              {zh ? "发布包与校验和" : "Release Packages & Checksums"} →
            </Link>
          </div>
        )}
        <nav
          className="operations-toc"
          aria-label={zh ? "本页内容" : "On this page"}
        >
          {guide.sections.map((section) => (
            <a key={section.id} href={`#${section.id}`}>
              {section.title[locale]}
            </a>
          ))}
        </nav>
        <div className="prose">
          {guide.sections.map((section, index) => (
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
                  case "link":
                    return (
                      <p key={i}>
                        <Link href={block.href.replaceAll("{locale}", locale)}>
                          {block.text[locale]} →
                        </Link>
                      </p>
                    );
                  case "list":
                    return (
                      <ul key={i}>
                        {block.items.map((item, j) => (
                          <li key={j}>
                            <Inline>{item[locale]}</Inline>
                          </li>
                        ))}
                      </ul>
                    );
                  case "code":
                    return (
                      <div key={i} data-doc-example={block.file}>
                        <CopyCode
                          locale={locale}
                          code={readText(block.file).trim()}
                        />
                      </div>
                    );
                  case "table":
                    return (
                      <div className="operations-table" key={i}>
                        <table>
                          <thead>
                            <tr>
                              {block.headers.map((h, j) => (
                                <th key={j} scope="col">
                                  {h[locale]}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {block.rows.map((row, j) => (
                              <tr key={j}>
                                {row.map((cell, k) => (
                                  <td key={k}>
                                    <Inline>{cell[locale]}</Inline>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                }
              })}
              {guide.id === "quick-start" && index === 0 && (
                <QuickStartInstaller
                  locale={locale}
                  version="0.1.0"
                  dependencies={quickStartDependencies}
                  packages={stablePackages().map((pkg) => ({
                    ...pkg,
                    directory: pkg.filename.slice(0, -7),
                    commands: `${pkg.commands} &&\ncd ${pkg.filename.slice(0, -7)} &&\n./lavik --version`,
                  }))}
                />
              )}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
