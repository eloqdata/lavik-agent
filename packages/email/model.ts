import { z } from "zod";
export const sender = "hubertzhang@eloqdata.com";
export const emailOrigin = "https://marketing.lavik.dev";
const text = z.string().trim().min(1).max(10000);
const template = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .refine((v) => !/[\r\n\u0000]/.test(v), "Subject must be one line"),
    body: text,
  })
  .strict();
export const jobSchema = z
  .object({
    name: z.string().trim().min(1).max(90),
    scheduledAt: z.iso.datetime().optional(),
    content: z.object({ a: template, b: template.optional() }).strict(),
    audience: z
      .object({
        domain: z
          .string()
          .trim()
          .toLowerCase()
          .max(253)
          .regex(/^$|^[a-z0-9.-]+\.[a-z]{2,63}$/),
        search: z.string().trim().max(100),
        limit: z.number().int().min(1).max(1000),
      })
      .strict(),
    campaign: z.string().regex(/^[a-z0-9][a-z0-9-]{0,89}$/),
    path: z
      .string()
      .max(220)
      .regex(/^\/(en|zh-CN)\/[a-z0-9/.-]*$/),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const variant of Object.values(v.content)) {
      if (!variant.body.includes("{{link}}"))
        ctx.addIssue({
          code: "custom",
          message:
            "Each variant must include {{link}} for its tracked destination",
        });
      for (const m of (variant.subject + "\n" + variant.body).matchAll(
        /{{([^}]+)}}/g,
      ))
        if (!["first_name", "last_name", "link", "unsubscribe"].includes(m[1]))
          ctx.addIssue({
            code: "custom",
            message: "Unknown template field: " + m[1],
          });
    }
  });
export type JobInput = z.infer<typeof jobSchema>;
export type EmailEnv = {
  EMAIL_DATABASE_URL?: string;
  OUTLOOK_TENANT_ID?: string;
  OUTLOOK_CLIENT_ID?: string;
  OUTLOOK_CLIENT_SECRET?: string;
};
export const configured = (e: EmailEnv) =>
  !!(e.OUTLOOK_TENANT_ID && e.OUTLOOK_CLIENT_ID && e.OUTLOOK_CLIENT_SECRET);
export function renderMessage(
  template: { subject: string; body: string },
  contact: { first_name: string; last_name: string },
  link: string,
  unsubscribe: string,
  address: string,
) {
  const values: Record<string, string> = {
    first_name: contact.first_name || "there",
    last_name: contact.last_name || "",
    link,
    unsubscribe,
  };
  const apply = (s: string) =>
    s.replace(/{{([^}]+)}}/g, (_, k: string) => values[k] ?? "");
  return {
    subject: apply(template.subject).replace(/[\r\n\u0000]/g, " "),
    body:
      apply(template.body) +
      `\n\nHubert Zhang | EloqData\n${address}\n\nTo stop receiving these emails: ${unsubscribe}`,
  };
}
export function retryAt(header: string | null, now = Date.now()) {
  const seconds = header && /^\d+$/.test(header) ? Number(header) : NaN;
  const date = header ? Date.parse(header) : NaN;
  return new Date(
    Math.max(
      now + 60000,
      Number.isFinite(seconds)
        ? now + seconds * 1000
        : Number.isFinite(date)
          ? date
          : now + 300000,
    ),
  );
}
