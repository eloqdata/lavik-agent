import Link from "next/link";
import { LanguageSwitch } from "./language-switch";
import type { Locale } from "../../../packages/content/schema";

export function Mark() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 4v22h20v-6H11V4H5Z" fill="currentColor" />
      <path d="M15 4v12h10V4H15Z" fill="currentColor" opacity=".4" />
    </svg>
  );
}
export function Header({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href={`/${locale}/`} className="wordmark" aria-label="Lavik home">
          <Mark />
          lavik<span className="version-pill">0.1.0 beta</span>
        </Link>
        <nav aria-label={zh ? "主导航" : "Main navigation"}>
          <Link href={`/${locale}/download/`}>{zh ? "下载" : "Download"}</Link>
          <Link href={`/${locale}/docs/0.1.0/`}>{zh ? "文档" : "Docs"}</Link>
          <Link href={`/${locale}/benchmarks/`}>
            {zh ? "基准测试" : "Benchmarks"}
          </Link>
          <Link href={`/${locale}/use-cases/`}>
            {zh ? "使用场景" : "Use cases"}
          </Link>
          <Link href={`/${locale}/blog/`}>{zh ? "博客" : "Blog"}</Link>
          <Link href={`/${locale}/community/`}>
            {zh ? "社区" : "Community"}
          </Link>
          <LanguageSwitch locale={locale} />
          <a className="github-link" href="https://github.com/eloqdata/lavik">
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
export function Footer({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div>
          <Link href={`/${locale}/`} className="wordmark">
            <Mark />
            lavik
          </Link>
          <p>{zh ? "让容量随存储扩展。" : "Let capacity grow with storage."}</p>
        </div>
        <nav aria-label={zh ? "页脚导航" : "Footer navigation"}>
          <Link href={`/${locale}/download/`}>{zh ? "下载" : "Download"}</Link>
          <Link href={`/${locale}/community/`}>
            {zh ? "社区" : "Community"}
          </Link>
          <Link href={`/${locale}/releases/`}>
            {zh ? "版本说明" : "Releases"}
          </Link>
          <Link href={`/${locale}/faq/evaluation/`}>FAQ</Link>
          <a href="https://github.com/eloqdata/lavik/blob/main/LICENSE">
            Apache 2.0
          </a>
          <a href="https://github.com/eloqdata/lavik/issues">
            {zh ? "反馈问题" : "Report an issue"}
          </a>
        </nav>
      </div>
      <div className="container footer-bottom">
        © 2026 EloqData ·{" "}
        {zh
          ? "开放源码，欢迎一起探索。"
          : "Open source. Open to your next idea."}
      </div>
    </footer>
  );
}
