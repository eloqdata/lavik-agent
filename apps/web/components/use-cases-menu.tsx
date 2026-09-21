"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "../../../packages/content/schema";

export function UseCasesMenu({
  locale,
  entries,
}: {
  locale: Locale;
  entries: {
    slug: string;
    group: "workload" | "industry";
    title: string;
    summary: string;
  }[];
}) {
  const zh = locale === "zh-CN",
    id = useId(),
    pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null),
    button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return (
    <div
      className="use-cases-menu"
      ref={wrapper}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          button.current?.focus();
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={button}
        className="use-cases-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {zh ? "使用场景" : "Use cases"}
        <span aria-hidden="true" className={open ? "chevron open" : "chevron"}>
          ⌄
        </span>
      </button>
      {open ? (
        <div className="use-cases-panel" id={id}>
          {(["workload", "industry"] as const).map((group) => (
            <div className="menu-column" key={group}>
              <h2>
                {group === "workload"
                  ? zh
                    ? "按工作负载"
                    : "BY WORKLOAD"
                  : zh
                    ? "按行业"
                    : "BY INDUSTRY"}
              </h2>
              <ul>
                {entries
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/${locale}/use-cases/${item.slug}/`}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                      >
                        <strong>
                          {item.title}
                          <span aria-hidden="true">↗</span>
                        </strong>
                        <span>{item.summary}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <div className="menu-feature">
            <p className="eyebrow">
              {zh ? "从容量出发，验证延迟" : "CAPACITY MEETS LATENCY"}
            </p>
            <strong>20×</strong>
            <h2>{zh ? "更低的值容量成本" : "lower value-capacity cost"}</h2>
            <p>
              {zh
                ? "按 DRAM / SSD 容量单价比 20:1 计算。查看十亿键性能与完整假设。"
                : "At a 20:1 DRAM / SSD capacity-price ratio. Explore the billion-key evidence and the assumptions."}
            </p>
            <Link href={`/${locale}/use-cases/`} onClick={() => setOpen(false)}>
              {zh ? "探索全部使用场景" : "Explore all use cases"} →
            </Link>
            <Link
              href={`/${locale}/use-cases/#evidence`}
              onClick={() => setOpen(false)}
            >
              {zh ? "查看延迟与吞吐量" : "Inspect latency & throughput"} →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
