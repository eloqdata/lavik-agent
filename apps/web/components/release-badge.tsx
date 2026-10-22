"use client";
import { usePathname } from "next/navigation";
import {
  defaultDocVersion,
  docVersionForRoute,
  isDocVersion,
} from "../../../packages/docs/versions";

// Keep unrelated navigation unchanged; docs/download identify the selected release.
export function ReleaseBadge() {
  const pathname = usePathname();
  if (/^\/(en|zh-CN)\/?$/.test(pathname)) return null;
  const route = pathname.split("/").filter(Boolean).slice(1).join("/");
  const downloadVersion = route.startsWith("download/")
    ? route.split("/")[1]
    : undefined;
  const releaseVersion =
    route === "releases/0-1-0"
      ? "0.1.0"
      : route === "releases/0-1-0-beta-1"
        ? "0.1.0-beta.1"
        : undefined;
  const version =
    docVersionForRoute(route) ??
    (downloadVersion && isDocVersion(downloadVersion)
      ? downloadVersion
      : (releaseVersion ?? defaultDocVersion));
  return (
    <span className="version-pill">
      {version} {version.includes("beta") ? "Beta" : "Stable"}
    </span>
  );
}
