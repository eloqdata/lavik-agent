"use client";
import Link from "next/link";
import { useId, useState } from "react";
import type { Locale } from "../../../packages/content/schema";

export type DocLink = {
  title: string;
  href: string;
  keywords?: string;
  kind?: string;
};
export function DocsNavigation({
  locale,
  route,
  groups,
  entries,
}: {
  locale: Locale;
  route: string;
  groups: { title: string; links: DocLink[] }[];
  entries: DocLink[];
}) {
  const zh = locale === "zh-CN";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const normalized = query.trim().toLocaleLowerCase();
  const matches = normalized
    ? entries
        .filter((item) =>
          `${item.title} ${item.keywords ?? ""}`
            .toLocaleLowerCase()
            .includes(normalized),
        )
        .sort(
          (a, b) =>
            Number(b.title.toLocaleLowerCase() === normalized) -
            Number(a.title.toLocaleLowerCase() === normalized),
        )
    : [];
  const current = `/${locale}/${route}/`;
  return (
    <>
      <div className="docs-search">
        <label htmlFor={id}>{zh ? "搜索文档" : "Search documentation"}</label>
        <input
          id={id}
          type="search"
          placeholder={
            zh ? "命令、客户端、指南…" : "Commands, clients, guides…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuery("");
          }}
        />
        {normalized ? (
          <div className="docs-search-results">
            <p role="status">
              {zh
                ? `找到 ${matches.length} 项结果`
                : `${matches.length} results`}
              {matches.length > 8
                ? zh
                  ? " · 显示前 8 项"
                  : " · showing the first 8"
                : ""}
            </p>
            <ul>
              {matches.slice(0, 8).map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    onClick={() => setQuery("")}
                  >
                    <span>{item.title}</span>
                    <small>{item.kind}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="docs-menu-toggle"
        aria-expanded={open}
        aria-controls={`${id}-nav`}
        onClick={() => setOpen(!open)}
      >
        {zh ? "文档目录" : "Browse documentation"}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <nav
        id={`${id}-nav`}
        className="docs-grouped-nav"
        data-open={open}
        aria-label={zh ? "文档导航" : "Documentation navigation"}
      >
        {groups.map((group) => (
          <details
            className="docs-nav-group"
            key={`${current}:${group.title}`}
            open={
              current !== `/${locale}/docs/0.1.0/` &&
              group.links.some((link) => {
                const href = link.href.split("#")[0];
                return (
                  current === href ||
                  ((href.endsWith("/commands/") ||
                    href.endsWith("/clients/")) &&
                    current.startsWith(href))
                );
              })
            }
          >
            <summary>
              {group.title}
              <span aria-hidden="true" className="docs-category-chevron">
                ›
              </span>
            </summary>
            <div className="docs-category-links">
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current === link.href ? "page" : undefined}
                  className={
                    current !== link.href &&
                    (link.href.endsWith("/commands/") ||
                      link.href.endsWith("/clients/")) &&
                    current.startsWith(link.href)
                      ? "active-section"
                      : undefined
                  }
                >
                  {link.title}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </nav>
    </>
  );
}
