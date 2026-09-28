"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Throwaway UI control. Keep URL state shareable; never render in production.
export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; name: string; question: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const index = variants.findIndex((variant) => variant.key === current);
  const selected = variants[index];

  function select(key: string) {
    const query = new URLSearchParams(searchParams.toString());
    query.set("variant", key);
    router.replace(`${pathname}?${query}`, { scroll: false });
  }

  useEffect(() => {
    function cycle(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable]"))
      )
        return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      select(
        variants[
          (index + (event.key === "ArrowRight" ? 1 : -1) + variants.length) %
            variants.length
        ].key,
      );
    }
    window.addEventListener("keydown", cycle);
    return () => window.removeEventListener("keydown", cycle);
  }, [index, pathname, searchParams, router, variants]);

  if (process.env.NODE_ENV === "production") return null;
  return (
    <aside
      className="prototype-switcher"
      aria-label="Homepage prototype variants"
    >
      <div className="prototype-switcher-top">
        <span className="prototype-tag">PROTOTYPE</span>
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() =>
            select(
              variants[(index + variants.length - 1) % variants.length].key,
            )
          }
        >
          ←
        </button>
        <div
          className="prototype-options"
          role="group"
          aria-label="Choose a variant"
        >
          {variants.map((variant) => (
            <button
              type="button"
              key={variant.key}
              aria-pressed={variant.key === current}
              onClick={() => select(variant.key)}
            >
              {variant.key}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => select(variants[(index + 1) % variants.length].key)}
        >
          →
        </button>
        <a className="prototype-original" href={pathname}>
          原版 ↗
        </a>
      </div>
      <p role="status">
        <strong>
          {current} · {selected.name}
        </strong>
        <span>{selected.question}</span>
      </p>
    </aside>
  );
}
