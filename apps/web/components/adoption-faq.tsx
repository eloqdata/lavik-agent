import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { faqFor } from "../../../packages/editorial/faq";
export function AdoptionFaq({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="container wide-page">
      <p className="eyebrow">LAVIK 0.2.0 / FAQ</p>
      <h1>
        {zh
          ? "开始使用 Lavik：常见问题"
          : "Getting started with Lavik: your questions answered"}
      </h1>
      <p className="page-lead">
        {zh
          ? "了解性能、容量成本、兼容性与迁移，选择适合应用的开始方式。"
          : "Performance, capacity cost, compatibility and migration—what you need to choose your first deployment."}
      </p>
      <div className="prose">
        {faqFor(locale).map((f) => (
          <section key={f.path + f.question}>
            <h2>{f.question}</h2>
            <p>{f.answer}</p>
            <Link href={`/${locale}/${f.path}/`}>{f.link} →</Link>
          </section>
        ))}
      </div>
    </main>
  );
}
