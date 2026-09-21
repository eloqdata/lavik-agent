import { z } from "zod";

export const localeSchema = z.enum(["en", "zh-CN"]);
export type Locale = z.infer<typeof localeSchema>;
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export const blockSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("heading"), text: z.string().min(1).max(160) })
    .strict(),
  z
    .object({
      type: z.literal("paragraph"),
      text: z.string().min(1).max(5000),
      sources: z.array(identifier),
    })
    .strict(),
  z.object({ type: z.literal("claim"), claimId: identifier }).strict(),
  z.object({ type: z.literal("recipe"), recipeId: identifier }).strict(),
  z
    .object({
      type: z.literal("calculation"),
      calculationId: z.literal("capacity-economics"),
    })
    .strict(),
]);
export const articleSchema = z
  .object({
    id: identifier,
    locale: localeSchema,
    version: z.literal("0.1.0"),
    kind: z.enum(["docs", "release", "use-case", "blog", "faq"]),
    slug: identifier,
    title: z.string().min(1).max(160),
    summary: z.string().min(1).max(500),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceRevision: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    blocks: z.array(blockSchema).min(1).max(40),
  })
  .strict();
export type Article = z.infer<typeof articleSchema>;
export const claimSchema = z
  .object({
    id: identifier,
    status: z.enum(["supported", "hypothesis"]),
    sources: z.array(identifier).min(1),
    text: z.object({ en: z.string(), "zh-CN": z.string() }),
    scope: z.string(),
  })
  .strict();
export type Claim = z.infer<typeof claimSchema>;
export const sourceSchema = z
  .object({
    id: identifier,
    title: z.string(),
    path: z.string(),
    upstreamPath: z.string(),
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Source = z.infer<typeof sourceSchema>;
export const recipeSchema = z
  .object({
    id: identifier,
    title: z.object({ en: z.string(), "zh-CN": z.string() }),
    prerequisites: z.object({ en: z.string(), "zh-CN": z.string() }),
    steps: z
      .array(
        z
          .object({ argv: z.array(z.string()).min(1), expected: z.string() })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type Recipe = z.infer<typeof recipeSchema>;
export const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    recipeId: identifier,
    recipeHash: z.string(),
    sourceCommit: z.string(),
    release: z.string(),
    artifactSha256: z.string(),
    imageId: z.string(),
    harnessHash: z.string(),
    status: z.enum(["passed", "failed", "unavailable"]),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime(),
    platform: z.string(),
    output: z.string(),
  })
  .strict();
export type Receipt = z.infer<typeof receiptSchema>;
export const reviewSchema = z
  .object({
    verdict: z.enum(["pass", "revise", "blocked"]),
    findings: z.array(z.string()),
    checkedSourceIds: z.array(identifier),
  })
  .strict();
export type Review = z.infer<typeof reviewSchema>;
