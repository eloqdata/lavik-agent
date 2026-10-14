"use client";
import { useState } from "react";
import type { Locale } from "../../../packages/content/schema";
export function BenchmarkCode({
  code,
  language,
  locale,
}: {
  code: string;
  language: string;
  locale: Locale;
}) {
  const [status, setStatus] = useState("");
  return (
    <div className="benchmark-code">
      <div className="benchmark-code-toolbar">
        <span>
          {language === "bash"
            ? "Bash"
            : language === "conf"
              ? locale === "en"
                ? "Configuration"
                : "配置"
              : language || "Text"}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setStatus(locale === "en" ? "Copied" : "已复制");
            } catch {
              setStatus(
                locale === "en"
                  ? "Select the text to copy."
                  : "请选择文本复制。",
              );
            }
          }}
        >
          {locale === "en" ? "Copy" : "复制"}
        </button>
        <span role="status">{status}</span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
