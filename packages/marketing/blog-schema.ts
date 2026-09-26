import { z } from "zod";
import { articleSchema, blockSchema } from "../content/schema.ts";

// The subscription CLI's structured output accepts anyOf, not oneOf. These
// branches remain disjoint through their literal type fields. Every property
// must be required; publication provenance is assigned outside draft writing.
export const blogDraftSchema = z
  .object({
    articles: articleSchema
      .omit({ publishedAt: true, sourceRevision: true })
      .required({ topics: true })
      .extend({
        kind: z.literal("blog"),
        blocks: z.array(z.union(blockSchema.options)).min(1).max(40),
      })
      .array()
      .length(2),
  })
  .strict();
