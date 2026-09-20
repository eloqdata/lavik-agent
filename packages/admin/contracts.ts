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
};
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
  !["queued", "running"].includes(status);

export const channels = [
  {
    name: "lavik.dev",
    state: "Existing website pipeline",
    detail:
      "The CLI/GitHub campaign workflow publishes verified blog pairs. Admin outputs are reviewed drafts; connecting them to this publisher is the next step.",
  },
  ...["X", "Reddit", "WeChat", "Medium", "Rednote / 小红书"].map((name) => ({
    name,
    state: "Not connected",
    detail:
      "Requires an account connection, channel rules, and a verified publishing adapter.",
  })),
];
