import { websiteStructuredData } from "../../../../../packages/seo/site";
import { StructuredData } from "../../../components/structured-data";
import { Analytics } from "../../../components/analytics";
import { Suspense } from "react";
import { articles } from "../../../../../packages/content/repository";
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
    default: "Lavik — Redis-compatible storage on NVMe SSD",
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
        <StructuredData data={websiteStructuredData} />
        <Suspense fallback={null}>
          <Analytics
            campaignIds={[
              ...new Set(
                articles()
                  .filter((a) => a.kind === "blog")
                  .map((a) => a.id),
              ),
            ]}
          />
        </Suspense>
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
