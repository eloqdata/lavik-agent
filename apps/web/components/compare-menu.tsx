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
      className="use-cases-menu compare-menu"
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
        <div className="use-cases-panel compare-panel" id={id}>
          {(["current", "historical"] as const).map((group) => (
            <div className="menu-column" key={group}>
              <h2>
                {group === "current"
                  ? zh
                    ? "内存与 SSD 分层"
                    : "DRAM & SSD TIERING"
                  : zh
                    ? "更多产品对比"
                    : "MORE ALTERNATIVES"}
              </h2>
              <ul>
                {comparisonProducts
                  .filter(
                    (p) =>
                      (p.group === "historical") === (group === "historical"),
                  )
                  .map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/${locale}/${comparisonRoute(p.id)}/`}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                      >
                        <strong>
                          Lavik vs {p.name}
                          <span aria-hidden="true">↗</span>
                        </strong>
                        <span>
                          {p.group === "memory"
                            ? zh
                              ? "DRAM 容量成本与 NVMe SSD 性能。"
                              : "DRAM capacity cost & NVMe SSD performance."
                            : p.group === "storage"
                              ? zh
                                ? "十亿键吞吐量与尾延迟。"
                                : "Billion-key throughput & tail latency."
                              : zh
                                ? "SSD 吞吐量与节点成本估算。"
                                : "SSD throughput & node-cost estimates."}
                        </span>
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
            <Link href={`/${locale}/compare/`} onClick={() => setOpen(false)}>
              {zh ? "探索全部产品对比" : "Explore all comparisons"} →
            </Link>
            <Link
              href={`/${locale}/benchmarks/`}
              onClick={() => setOpen(false)}
            >
              {zh ? "查看延迟与吞吐量" : "Inspect latency & throughput"} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
