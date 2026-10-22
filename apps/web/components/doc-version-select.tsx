"use client";
import "./manual.css";
import { useId } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "../../../packages/content/schema";
import {
  defaultDocVersion,
  type DocVersion,
} from "../../../packages/docs/versions";

export function DocVersionSelect({
  locale,
  version,
  options,
}: {
  locale: Locale;
  version: DocVersion;
  options: { version: DocVersion; href: string }[];
}) {
  const id = useId();
  const router = useRouter();
  const zh = locale === "zh-CN";
  return (
    <div className="doc-version-select">
      <label htmlFor={id}>{zh ? "版本" : "Version"}</label>
      <select
        id={id}
        value={version}
        onChange={(event) => {
          const option = options.find(
            (item) => item.version === event.target.value,
          );
          if (option) router.push(option.href + window.location.hash);
        }}
      >
        {options.map((option) => (
          <option key={option.version} value={option.version}>
            {option.version}
            {option.version === defaultDocVersion
              ? zh
                ? "（默认 · 稳定版）"
                : " (Default · Stable)"
              : option.version === "0.1.0-beta.1"
                ? zh
                  ? "（历史 Beta）"
                  : " (Archived Beta)"
                : zh
                  ? "（历史稳定版）"
                  : " (Archived Stable)"}
          </option>
        ))}
      </select>
    </div>
  );
}
