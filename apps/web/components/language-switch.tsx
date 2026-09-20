"use client";
import { usePathname } from "next/navigation";

export function LanguageSwitch({ locale }: { locale: string }) {
  const pathname = usePathname();
  const target = locale === "en" ? "zh-CN" : "en";
  return (
    <a
      className="language-switch"
      href={pathname.replace(/^\/(en|zh-CN)(?=\/|$)/, `/${target}`)}
      hrefLang={target}
      lang={target}
      aria-label={
        locale === "en" ? "Switch to Simplified Chinese" : "Switch to English"
      }
    >
      {target === "en" ? "EN" : "中文"}
    </a>
  );
}
