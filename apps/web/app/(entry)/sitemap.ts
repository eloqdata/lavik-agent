import type { MetadataRoute } from "next";
import { articles, articlePath } from "../../../../packages/content/repository";
import { manualRoutes } from "../../../../packages/manual/repository";
import { useCases } from "../../../../packages/use-cases/content";
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
      "docs/0.1.0/",
    ].map((route) => `/${locale}/${route}`),
  );
  return [
    ...["en", "zh-CN"].flatMap((locale) =>
      useCases.map((entry) => ({
        url: `https://lavik.dev/${locale}/use-cases/${entry.slug}/`,
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
}
