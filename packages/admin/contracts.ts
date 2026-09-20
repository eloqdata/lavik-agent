import { z } from "zod";
import {
  articleSchema,
  receiptSchema,
  reviewSchema,
} from "../content/schema.ts";

export const roles = [
  {
    id: "manual-writer",
    name: "User manual writer",
    kind: "docs",
    work: "writer",
    description:
      "Writes versioned guides, verifies commands, and sends both editions to independent review.",
  },
  {
    id: "blog-writer",
    name: "Blog writer",
    kind: "blog",
    work: "writer",
    description:
      "Turns a brief and primary evidence into useful English and Chinese articles.",
  },
  {
    id: "manual-reviewer",
    name: "User manual reviewer",
    kind: "docs",
    work: "reviewer",
    description:
      "Checks instructions, release identity, source support, and actual command results.",
  },
  {
    id: "blog-reviewer",
    name: "Blog reviewer",
    kind: "blog",
    work: "reviewer",
    description:
      "Independently checks claims, calculations, evidence, and editorial quality.",
  },
] as const;
export const roleSchema = z.enum([
  "manual-writer",
  "blog-writer",
  "manual-reviewer",
  "blog-reviewer",
]);
export type Role = z.infer<typeof roleSchema>;
export const statusSchema = z.enum([
  "queued",
  "running",
  "approved",
  "needs_revision",
  "failed",
  "cancelled",
  "publishing",
  "deploying",
  "published",
  "publication_failed",
]);
export type TaskStatus = z.infer<typeof statusSchema>;
export const taskInputSchema = z
  .object({
    requestId: z.string().uuid(),
    role: roleSchema,
    title: z.string().trim().min(3).max(160),
    brief: z.string().trim().min(10).max(12000),
    articleId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,80}$/)
      .optional(),
  })
  .strict();
export const editionSchema = z
  .object({
    article: articleSchema,
    review: reviewSchema,
    receipts: z.array(receiptSchema).max(20),
    contentHash: z.string(),
    renderingHash: z.string(),
  })
  .strict();
export const resultSchema = z
  .object({
    references: z
      .object({
        claims: z.record(
          z.string(),
          z.object({ en: z.string(), "zh-CN": z.string() }),
        ),
        sources: z.record(z.string(), z.string().url()),
      })
      .optional(),
    editions: z.array(editionSchema).min(1).max(2),
    runtime: z.string().max(500),
    knowledgeHash: z.string(),
    sourceCommit: z.string(),
    completedAt: z.string().datetime(),
    publicationContext: z
      .object({
        rendererVersion: z.literal(2),
        policyHash: z.string().regex(/^[a-f0-9]{64}$/),
        baseContentHashes: z
          .object({ en: z.string().nullable(), "zh-CN": z.string().nullable() })
          .strict(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TaskResult = z.infer<typeof resultSchema>;
export type Task = {
  id: string;
  requestId: string;
  role: Role;
  title: string;
  brief: string;
  articleId?: string;
  parentId?: string;
  status: TaskStatus;
  stage: string;
  activeRole?: Role;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  startedAt?: string;
  finishedAt?: string;
  leaseExpiresAt?: string;
  runnerId?: string;
  runUrl?: string;
  error?: string;
  result?: TaskResult;
  publication?: Publication;
};
export type Publication = {
  taskId: string;
  artifactHash: string;
  status:
    | "queued"
    | "publishing"
    | "deploying"
    | "published"
    | "failed"
    | "cancelled";
  attempts: number;
  createdAt: string;
  updatedAt: string;
  leaseExpiresAt?: string;
  nextAttemptAt?: string;
  runUrl?: string;
  commit?: string;
  deploymentId?: string;
  publishedAt?: string;
  urls?: { en: string; "zh-CN": string };
  error?: string;
};
export const publicationClaimSchema = z
  .object({
    runnerId: z.string().min(1).max(120),
    runUrl: z
      .string()
      .regex(
        /^https:\/\/github\.com\/eloqdata\/lavik-agent\/actions\/runs\/\d+$/,
      ),
  })
  .strict();
export const publicationReviewSchema = z
  .object({
    requestId: z.string().uuid(),
    articleId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,80}$/),
  })
  .strict();
export const publicationRevisionSchema = z
  .object({
    requestId: z.string().uuid(),
    taskId: z.string().uuid(),
  })
  .strict();
export const publicationUpdateSchema = z
  .object({
    leaseToken: z.string().uuid(),
    artifactHash: z.string().regex(/^[a-f0-9]{64}$/),
    stage: z.enum(["heartbeat", "deploying", "published", "failed"]),
    commit: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    deploymentId: z.string().uuid().optional(),
    error: z.string().max(2000).optional(),
    retryable: z.boolean().optional(),
  })
  .strict();
export type TaskEvent = {
  id: string;
  taskId: string;
  at: string;
  type: string;
  message: string;
  actor: string;
  data?: Record<string, unknown>;
};
export type CatalogItem = {
  id: string;
  kind: "docs" | "blog";
  title: string;
  version: string;
};
export type RunnerStatus = {
  id: string;
  lastSeenAt: string;
  model: string;
  reviewerModel: string;
  runUrl?: string;
  catalog: CatalogItem[];
};
export type Dashboard = {
  tasks: Omit<Task, "result" | "brief">[];
  runners: RunnerStatus[];
  counts: Record<TaskStatus, number>;
  email: string;
  dispatch?: DispatchStatus;
};
export type DispatchStatus = {
  state: "idle" | "starting" | "running" | "retrying" | "unconfigured";
  message: string;
  attempts: number;
  lastAttemptAt?: string;
  nextAttemptAt?: string;
  runUrl?: string;
};
export type TaskDetail = { task: Task; events: TaskEvent[] };
export const heartbeatSchema = z
  .object({
    runnerId: z.string().min(1).max(120),
    model: z.string().max(100),
    reviewerModel: z.string().max(100),
    runUrl: z.string().url().optional(),
    catalog: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            kind: z.enum(["docs", "blog"]),
            title: z.string().max(160),
            version: z.string().max(40),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export const feedbackSchema = z
  .object({
    requestId: z.string().uuid(),
    message: z.string().trim().min(1).max(8000),
    action: z.enum(["comment", "revise", "retry"]),
  })
  .strict();
export const updateSchema = z
  .object({
    leaseToken: z.string().uuid(),
    stage: z.string().max(120),
    activeRole: roleSchema.optional(),
    event: z
      .object({
        type: z.string().max(100),
        message: z.string().max(2000),
        data: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    result: resultSchema.optional(),
    error: z.string().max(2000).optional(),
  })
  .strict();
export const terminal = (status: TaskStatus) =>
  !["queued", "running", "publishing", "deploying"].includes(status);

export const channels = [
  {
    name: "lavik.dev",
    state: "Automatic publication",
    detail:
      "Passing English and Chinese drafts are published automatically, deployed to Cloudflare, and checked live. Publication status and links appear on each task.",
  },
  ...["X", "Reddit", "WeChat", "Medium", "Rednote / 小红书"].map((name) => ({
    name,
    state: "Not connected",
    detail:
      "Requires an account connection, channel rules, and a verified publishing adapter.",
  })),
];
