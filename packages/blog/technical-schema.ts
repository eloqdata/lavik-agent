import { z } from "zod";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const caption = {
  id: identifier,
  afterBlock: z.number().int().min(0).max(39),
  caption: z.string().min(1).max(2000),
  sources: identifier.array().min(1),
};
export const technicalArticleSchema = z
  .object({
    sources: z
      .array(
        z
          .object({
            id: identifier,
            title: z.string().min(1),
            url: z.string().url().startsWith("https://"),
            file: z
              .string()
              .regex(/^(?:evidence|perf_reports)\/[a-zA-Z0-9_./-]+$/)
              .refine((v) => !v.split("/").includes("..")),
            sha256: sha,
          })
          .strict(),
      )
      .min(1)
      .max(60),
    visuals: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              ...caption,
              type: z.literal("table"),
              columns: z.string().min(1).array().min(2).max(10),
              rows: z.array(z.string().array().min(2).max(10)).min(1).max(30),
            })
            .strict(),
          z
            .object({
              ...caption,
              type: z.literal("figure"),
              src: z.string().regex(/^\/blog-assets\/[a-z0-9/-]+\.svg$/),
              alt: z.string().min(1).max(1500),
              sha256: sha,
              width: z.number().int().positive(),
              height: z.number().int().positive(),
            })
            .strict(),
        ]),
      )
      .max(20),
  })
  .strict();
