"use client";
import { useState } from "react";
import type { Locale } from "../../../packages/content/schema";

export function CopyCode({ code, locale }: { code: string; locale: Locale }) {
  const [status, setStatus] = useState("");
  const zh = locale === "zh-CN";
  return (
    <div className="copy-code">
      <div className="copy-code-toolbar">
        <span>Linux · bash</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setStatus(zh ? "已复制" : "Copied");
            } catch {
              setStatus(
                zh
                  ? "请选择下方命令并复制。"
                  : "Select the commands below to copy them.",
              );
            }
          }}
        >
          {zh ? "复制命令" : "Copy commands"}
        </button>
        <span role="status">{status}</span>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}
