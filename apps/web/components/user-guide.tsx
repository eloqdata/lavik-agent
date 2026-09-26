import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { readText } from "../../../packages/content/repository";
import { requireReviewedManual } from "../../../packages/manual/gate";
import type { UserGuide } from "../../../packages/docs/repository";
import { DocsSidebar } from "./docs-sidebar";
import { CopyCode } from "./copy-code";
import "./operations.css";
export function UserGuidePage({
  locale,
  guide,
}: {
  locale: Locale;
  guide: UserGuide;
}) {
  const publication = requireReviewedManual();
  const root = `/${locale}/docs/0.1.0`;
  return (
    <main
      id="main"
      className="container document-layout"
      data-manual-hash={publication.bundleHash}
    >
      <DocsSidebar locale={locale} route={`docs/0.1.0/${guide.id}`} />
      <article className="document">
        <div className="breadcrumb">
          <Link href={`${root}/`}>Lavik Docs</Link>
          <span>/</span>
          <span>0.1.0-beta.1</span>
        </div>
        <h1>{guide.title[locale]}</h1>
        <p className="document-summary">{guide.summary[locale]}</p>
        <nav
          className="operations-toc"
          aria-label={locale === "en" ? "On this page" : "本页内容"}
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
              {section.blocks.map((block, i) =>
                block.type === "paragraph" ? (
                  <p key={i}>{block.text[locale]}</p>
                ) : block.type === "link" ? (
                  <p key={i}>
                    <Link href={block.href.replaceAll("{locale}", locale)}>
                      {block.text[locale]} →
                    </Link>
                  </p>
                ) : (
                  <div key={i}>
                    <p className="eyebrow">{block.name}</p>
                    <CopyCode
                      locale={locale}
                      code={readText(
                        `verification/onboarding/${block.name}`,
                      ).trim()}
                    />
                  </div>
                ),
              )}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
