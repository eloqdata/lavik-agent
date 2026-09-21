import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header, Footer } from "../../../components/site";
import { localeSchema } from "../../../../../packages/content/schema";
import "../../styles.css";
import "../../../components/resources.css";
import "../../../components/use-cases.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "zh-CN" }];
}
export const metadata: Metadata = {
  metadataBase: new URL("https://lavik.dev"),
  title: {
    default: "Lavik — Faster than Redis. Capacity on NVMe SSD.",
    template: "%s · Lavik",
  },
  description:
    "An open-source Redis-compatible key-value store built around NVMe SSD storage. Explore the benchmarks and evaluate Lavik 0.1.0.",
  icons: { icon: "/icon.svg" },
};
export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const parsed = localeSchema.safeParse((await params).locale);
  if (!parsed.success) notFound();
  return (
    <html lang={parsed.data}>
      <body>
        <a href="#main" className="skip-link">
          {parsed.data === "en" ? "Skip to content" : "跳至正文"}
        </a>
        <Header locale={parsed.data} />
        {children}
        <Footer locale={parsed.data} />
      </body>
    </html>
  );
}
