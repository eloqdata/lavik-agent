"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Locale } from "../../../packages/content/schema";
import {
  benchmarkReports,
  benchmarkRoute,
} from "../../../packages/benchmarks/catalog";
export function BenchmarksMenu({ locale }: { locale: Locale }) {
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
      className="use-cases-menu benchmarks-menu"
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
        {zh ? "基准测试" : "Benchmarks"}
        <span aria-hidden="true" className={open ? "chevron open" : "chevron"}>
          ⌄
        </span>
      </button>
      {open && (
        <div className="use-cases-panel benchmarks-panel" id={id}>
          {[
            ["2vcpu-capacity", "redis-valkey"],
            ["1tb-storage", "aerospike-ycsb"],
          ].map((ids, i) => (
            <div className="menu-column" key={i}>
              <h2>
                {i === 0
                  ? zh
                    ? "Redis 与 Valkey 对比"
                    : "REDIS & VALKEY"
                  : zh
                    ? "SSD 数据库对比"
                    : "SSD DATABASE COMPARISONS"}
              </h2>
              <ul>
                {ids.map((id) => {
                  const r = benchmarkReports.find((r) => r.id === id)!;
                  return (
                    <li key={id}>
                      <Link
                        href={`/${locale}/${benchmarkRoute(id)}/`}
                        prefetch={false}
                        onClick={() => setOpen(false)}
                      >
                        <strong>
                          {r.label[locale]}
                          <span aria-hidden="true">↗</span>
                        </strong>
                        <span>{r.summary[locale]}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="menu-feature">
            <p className="eyebrow">
              {zh ? "NVMe SSD · 实测结果" : "NVMe SSD · MEASURED RESULTS"}
            </p>
            <strong>0.1.0</strong>
            <h2>{zh ? "四个角度，看清性能" : "Four views of performance"}</h2>
            <p>
              {zh
                ? "查看原始图表、吞吐量、p99.9 与可复制的测试步骤。"
                : "Explore original charts, throughput, p99.9 and copyable reproduction steps."}
            </p>
            <Link
              href={`/${locale}/benchmarks/`}
              onClick={() => setOpen(false)}
            >
              {zh ? "全部基准测试" : "All benchmarks"} →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
