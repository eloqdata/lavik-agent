"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "../../../packages/content/schema";
import {
  comparisonProducts,
  comparisonRoute,
} from "../../../packages/comparisons/catalog";
export function CompareMenu({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN",
    id = useId(),
    pathname = usePathname();
  const [open, setOpen] = useState(false),
    wrapper = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      className="compare-menu"
      ref={wrapper}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        className="use-cases-trigger"
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {zh ? "产品对比" : "Compare"}
        <span aria-hidden="true" className={open ? "chevron open" : "chevron"}>
          ⌄
        </span>
      </button>
      {open && (
        <div className="compare-panel" id={id}>
          <Link
            className="compare-menu-all"
            href={`/${locale}/compare/`}
            onClick={() => setOpen(false)}
          >
            {zh ? "探索全部产品对比" : "Explore all comparisons"} →
          </Link>
          <ul>
            {comparisonProducts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/${locale}/${comparisonRoute(p.id)}/`}
                  prefetch={false}
                  onClick={() => setOpen(false)}
                >
                  Lavik vs {p.name}
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
