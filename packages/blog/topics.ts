import { z } from "zod";

export const blogTopicSchema = z.enum([
  "architecture",
  "benchmark",
  "use-case",
  "best-practise",
  "news",
]);
export type BlogTopic = z.infer<typeof blogTopicSchema>;
export const blogTopics: {
  id: BlogTopic;
  label: { en: string; "zh-CN": string };
}[] = [
  { id: "architecture", label: { en: "Architecture", "zh-CN": "架构" } },
  { id: "benchmark", label: { en: "Benchmark", "zh-CN": "基准测试" } },
  { id: "use-case", label: { en: "Use Case", "zh-CN": "使用场景" } },
  { id: "best-practise", label: { en: "Best Practise", "zh-CN": "最佳实践" } },
  { id: "news", label: { en: "News", "zh-CN": "动态" } },
];
