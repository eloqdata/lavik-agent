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
      "benchmarks/",
      "cost/",
      "use-cases/",
      "blog/",
      "releases/",
      "download/",
      "community/",
      "about/",
      "privacy/",
      "docs/0.1.0/",
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
      [...operationsRoutes(), ...userGuideRoutes()].map((route) => ({
        url: `https://lavik.dev/${locale}/${route}/`,
      })),
    ),
    ...["en", "zh-CN"].flatMap((locale) =>
      manualRoutes().map((route) => ({
        url: `https://lavik.dev/${locale}/${route}/`,
      })),
    ),
    ...paths.map((p) => ({ url: `https://lavik.dev${p}` })),
    ...articles().map((a) => ({
      url: `https://lavik.dev${articlePath(a)}`,
      lastModified: a.updatedAt,
    })),
  ];
  return entries.map((entry) => {
    const url = new URL(entry.url),
      parts = url.pathname.split("/").filter(Boolean),
      locale = parts[0],
      route = parts.slice(1).join("/");
    const source = route.startsWith("docs/0.1.0/commands")
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
