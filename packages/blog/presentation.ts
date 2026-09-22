import { z } from "zod";
import legacy from "../../content/blog-presentation.json";
import type { Article } from "../content/schema.ts";
import { blogTopicSchema, type BlogTopic } from "./topics.ts";

export const coverMotifs = [
  "flow",
  "index",
  "transactions",
  "checkpoint",
  "replication",
  "failover",
  "collections",
  "functions",
  "throughput",
  "inspection",
] as const;
export type CoverMotif = (typeof coverMotifs)[number];
export const legacyBlogPresentation = z
  .record(
    z.string(),
    z
      .object({
        topics: blogTopicSchema.array().min(1).max(5),
        motif: z.enum(coverMotifs),
      })
      .strict(),
  )
  .parse(legacy);

const defaults: Record<BlogTopic, CoverMotif> = {
  architecture: "index",
  benchmark: "throughput",
  "use-case": "flow",
  "best-practise": "inspection",
  news: "replication",
};

export function blogPresentation(article: Article) {
  if (article.kind !== "blog")
    throw new Error("Blog presentation requires a blog article");
  const existing = legacyBlogPresentation[article.id];
  const topics = article.topics ?? existing?.topics;
  if (!topics?.length)
    throw new Error(`Blog ${article.id} needs at least one topic`);
  return {
    topics,
    motif: existing?.motif ?? defaults[topics[0]],
    cover: `/blog-covers/${article.id}.svg`,
  };
}

export function sortedBlogPosts(pages: Article[]) {
  return pages
    .filter((article) => article.kind === "blog")
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) ||
        a.title.localeCompare(b.title),
    );
}
