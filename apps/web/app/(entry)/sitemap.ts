import {
  benchmarkReports,
  benchmarkRoute,
} from "../../../../packages/benchmarks/catalog";
import {
  stableGuideRoutes,
  stableManualRoutes,
} from "../../../../packages/docs/stable";
import {
  comparisonProducts,
  comparisonRoute,
} from "../../../../packages/comparisons/catalog";
import { pageInfo } from "../../../../packages/seo/site";
import { changedAt } from "../../../../packages/seo/dates";
import type { Locale } from "../../../../packages/content/schema";
import { userGuideRoutes } from "../../../../packages/docs/repository";
import type { MetadataRoute } from "next";
import { articles, articlePath } from "../../../../packages/content/repository";
import { manualRoutes } from "../../../../packages/manual/repository";
import { useCases } from "../../../../packages/use-cases/content";
import { blogTopics } from "../../../../packages/blog/topics";
import { operationsRoutes } from "../../../../packages/operations/repository";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["en", "zh-CN"].flatMap((locale) =>
    [
      "",
      "compare/",
      ...comparisonProducts.map((p) => `${comparisonRoute(p.id)}/`),
      "benchmarks/",
      ...benchmarkReports.map((r) => `${benchmarkRoute(r.id)}/`),
      "cost/",
      "use-cases/",
      "blog/",
      "releases/",
      "download/",
      "community/",
      "about/",
      "privacy/",
      "docs/0.1.0/",
      "docs/0.1.0-beta.1/",
      "download/0.1.0-beta.1/",
      "releases/0-1-0/",
    ].map((route) => `/${locale}/${route}`),
  );
  const entries: MetadataRoute.Sitemap = [
    ...["en", "zh-CN"].flatMap((locale) =>
      blogTopics
        .filter(
          (topic) =>
            !pageInfo(locale as Locale, `blog/topic/${topic.id}`).emptyTopic,
        )
        .map((topic) => ({
          url: `https://lavik.dev/${locale}/blog/topic/${topic.id}/`,
        })),
    ),
    ...["en", "zh-CN"].flatMap((locale) =>
      useCases.map((entry) => ({
        url: `https://lavik.dev/${locale}/use-cases/${entry.slug}/`,
      })),
    ),
    ...["en", "zh-CN"].flatMap((locale) =>
      [...operationsRoutes(), ...userGuideRoutes(), ...stableGuideRoutes()].map(
        (route) => ({
          url: `https://lavik.dev/${locale}/${route}/`,
        }),
      ),
    ),
    ...["en", "zh-CN"].flatMap((locale) =>
      [...manualRoutes(), ...stableManualRoutes()].map((route) => ({
        url: `https://lavik.dev/${locale}/${route}/`,
      })),
    ),
    ...paths.map((p) => ({ url: `https://lavik.dev${p}` })),
    ...articles()
      .filter((a) => a.id !== "capacity-use-case")
      .map((a) => ({
        url: `https://lavik.dev${articlePath(a)}`,
        lastModified: a.updatedAt,
      })),
  ];
  return entries.map((entry) => {
    const url = new URL(entry.url),
      parts = url.pathname.split("/").filter(Boolean),
      locale = parts[0],
      route = parts.slice(1).join("/");
    const stableDocs =
      route === "docs/0.1.0" || route.startsWith("docs/0.1.0/");
    const source = route.startsWith("benchmarks")
      ? "packages/benchmarks/catalog.ts"
      : stableDocs
        ? route.includes("/commands")
          ? "content/docs/0.1.0/catalog.json"
          : route.includes("/clients")
            ? "evidence/docs/0.1.0/clients.json"
            : "content/docs/0.1.0/guides.json"
        : route === "download"
          ? "content/docs/0.1.0/downloads.json"
          : route === "releases/0-1-0"
            ? "content/docs/0.1.0/release-notes.json"
            : route.startsWith("compare")
              ? "packages/comparisons/content.ts"
              : route.startsWith("docs/0.1.0/commands")
                ? "content/manual/0.1.0/catalog.json"
                : route.startsWith("docs/0.1.0/clients")
                  ? "verification/manual/clients/catalog.json"
                  : route.startsWith("use-cases")
                    ? "packages/use-cases/content.ts"
                    : operationsRoutes().includes(route)
                      ? "content/operations/0.1.0/guides.json"
                      : route.startsWith("docs/")
                        ? "packages/docs/guides.json"
                        : route === ""
                          ? "apps/web/app/(site)/[locale]/page.tsx"
                          : "apps/web/app/(site)/[locale]/[...slug]/page.tsx";
    return {
      ...entry,
      ...(entry.lastModified
        ? {}
        : changedAt(source)
          ? { lastModified: changedAt(source) }
          : {}),
      alternates: {
        languages: {
          en: `https://lavik.dev/en/${route ? `${route}/` : ""}`,
          "zh-CN": `https://lavik.dev/zh-CN/${route ? `${route}/` : ""}`,
        },
      },
    };
  });
}
