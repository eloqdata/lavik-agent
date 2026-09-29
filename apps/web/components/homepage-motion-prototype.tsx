"use client";

// THROWAWAY H/I/J/K: motion directions over the latest server-rendered homepage.
// The data, charts and illustration counts stay unchanged; only presentation moves.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import "./homepage-motion-prototype.css";

export const motionVariants = [
  { key: "H", name: "渐进登场", question: "标题分拍 → 图表展开 → 章节渐入" },
  { key: "I", name: "光流引擎", question: "光线扫过 → 请求流动 → 节点呼吸" },
  { key: "J", name: "滚动叙事", question: "滚动推进 → 插图展开 → 阅读进度" },
  {
    key: "K",
    name: "分拍 × 展开",
    question: "标题分拍 → 图表展开 → 插图随滚动展开",
  },
];

export function HomepageMotionPrototype({
  variant,
  locale,
  children,
}: {
  variant: string;
  locale: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [replay, setReplay] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const zh = locale === "zh-CN";

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const scene = root.current;
    if (!scene) return;
    const targets = [
      ...scene.querySelectorAll<HTMLElement>(
        ".home-split-heading, .home-engine, .home-three-cards, .home-scale-grid, .home-centered-heading, .home-cluster-figure, .home-sizing-facts, .home-sla-row, .home-agent-grid, .home-agent-cards, .home-open-source, .home-evaluate",
      ),
    ];
    targets.forEach((element) => element.classList.add("motion-watch"));
    scene.dataset.ready = "true";
    if (reduced || paused) return;

    if (variant !== "J" && variant !== "K") {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("motion-visible");
              if (variant === "H") observer.unobserve(entry.target);
            } else if (variant === "I") {
              entry.target.classList.remove("motion-visible");
            }
          });
        },
        { threshold: 0.12 },
      );
      targets.forEach((element) => observer.observe(element));
      return () => observer.disconnect();
    }

    // ponytail: one RAF updates the existing sections; no scroll-animation library.
    let frame = 0;
    const update = () => {
      frame = 0;
      targets.forEach((element) => {
        // Measure layout positions so animated translation/scale cannot feed back.
        let top = 0;
        for (
          let node: HTMLElement | null = element;
          node;
          node = node.offsetParent as HTMLElement | null
        ) {
          top += node.offsetTop;
        }
        const progress = Math.min(
          1,
          Math.max(0, (innerHeight - (top - scrollY)) / (innerHeight * 0.75)),
        );
        element.style.setProperty("--motion-progress", String(progress));
      });
      if (variant === "J") {
        const page = scene.getBoundingClientRect();
        const progress = Math.min(
          1,
          Math.max(0, -page.top / Math.max(1, page.height - innerHeight)),
        );
        scene.parentElement?.style.setProperty(
          "--page-progress",
          String(progress),
        );
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [variant, replay, paused, reduced]);

  return (
    <div
      className={`motion-lab motion-${variant.toLowerCase()}${variant === "K" ? " motion-j" : ""}`}
      data-variant={variant}
      data-paused={paused}
      data-reduced={reduced}
    >
      {variant === "J" && (
        <div className="motion-reading-progress" aria-hidden="true" />
      )}
      <aside
        className="motion-lab-controls"
        aria-label={zh ? "动画原型控制" : "Animation prototype controls"}
      >
        <span className="motion-lab-label">MOTION / {variant}</span>
        <span role="status">
          {reduced
            ? zh
              ? "系统设置：减少动态效果"
              : "Reduced motion enabled"
            : paused
              ? zh
                ? "已暂停"
                : "Paused"
              : variant === "J" || variant === "K"
                ? zh
                  ? "滚动页面以预览"
                  : "Scroll to explore"
                : zh
                  ? "播放中"
                  : "Playing"}
        </span>
        <button
          type="button"
          disabled={reduced}
          onClick={() => {
            setPaused(false);
            setReplay((value) => value + 1);
          }}
        >
          {zh ? "↻ 重播" : "↻ Replay"}
        </button>
        <button
          type="button"
          aria-pressed={paused}
          disabled={reduced}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? (zh ? "继续" : "Resume") : zh ? "暂停" : "Pause"}
        </button>
        <a href="#architecture">{zh ? "看图示" : "Diagrams"} ↓</a>
        <a href="#consolidation">300 → 3 ↓</a>
        <a href={pathname}>{zh ? "静态对照" : "Static baseline"} ↗</a>
        <a href={`${pathname}?variant=G`}>
          {zh ? "旧版原型" : "Layout studies"} ↗
        </a>
      </aside>
      <div className="motion-scene" ref={root} key={replay}>
        {children}
      </div>
    </div>
  );
}
