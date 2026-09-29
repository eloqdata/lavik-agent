"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { mountHomepageMotion } from "../../../packages/homepage/motion";
import "./homepage-motion.css";

export function HomepageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current) return mountHomepageMotion(root.current);
  }, []);
  return (
    <div className="homepage-motion" ref={root}>
      {children}
    </div>
  );
}
