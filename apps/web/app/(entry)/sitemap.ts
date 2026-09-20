import type { MetadataRoute } from "next";
import { articles, articlePath } from "../../../../packages/content/repository";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["en", "zh-CN"].flatMap((locale) =>
    ["", "benchmarks/", "cost/", "use-cases/", "blog/", "releases/"].map(
      (route) => `/${locale}/${route}`,
    ),
  );
  return [
    ...paths.map((p) => ({ url: `https://lavik.dev${p}` })),
    ...articles().map((a) => ({
      url: `https://lavik.dev${articlePath(a)}`,
      lastModified: a.updatedAt,
    })),
  ];
}
