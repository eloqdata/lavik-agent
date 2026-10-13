"use client";
import { usePathname } from "next/navigation";

// Keep unrelated navigation unchanged; docs/download identify the selected release.
export function ReleaseBadge() {
  const pathname = usePathname();
  if (/^\/(en|zh-CN)\/?$/.test(pathname)) return null;
  const currentReleaseArea =
    /^\/(en|zh-CN)\/(docs(?:\/0\.1\.0)?\/?$|docs\/0\.1\.0\/|download\/?$|releases\/0-1-0\/?$)/.test(
      pathname,
    );
  return (
    <span className="version-pill">
      {currentReleaseArea ? "0.1.0" : "0.1.0 beta"}
    </span>
  );
}
