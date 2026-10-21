import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { json } from "../admin/store";
import { database } from "./database";
import {
  configured,
  sender,
  jobSchema,
  renderMessage,
  type EmailEnv,
} from "./model";
type Store = { fetch(request: Request): Promise<Response> };
const uuid = z.string().uuid();
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    postal_address: z.string().trim().max(500),
    daily_limit: z.number().int().min(1).max(500),
    interval_seconds: z.number().int().min(60).max(86400),
  })
  .strict();
async function platform(
  store: Store,
  request: Request,
  endpoint: string,
  method = "GET",
  body?: unknown,
) {
  const u = new URL(request.url);
  u.pathname = "/platform/" + endpoint;
  u.search = "";
  const headers = new Headers(request.headers);
  headers.delete("Content-Length");
  return store.fetch(
    new Request(u, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
export async function emailApi(request: Request, env: EmailEnv, store: Store) {
  const auth = await platform(store, request, "session");
  if (!auth.ok) return auth;
  const session = (await auth.json()) as {
    mustChangePassword: boolean;
    csrf: string;
  };
  if (session.mustChangePassword)
    return json({ error: "Change the initial admin password first" }, 403);
  if (request.method !== "GET") {
    const a = Buffer.from(session.csrf),
      b = Buffer.from(request.headers.get("X-CSRF-Token") ?? "");
    if (a.length !== b.length || !timingSafeEqual(a, b))
      return json({ error: "Invalid CSRF token" }, 403);
  }
  if (!env.EMAIL_DATABASE_URL)
    return json({ error: "Email database is not connected yet" }, 503);
  const sql = database(env),
    url = new URL(request.url),
    path = url.pathname.replace("/api/email/", "");
  try {
    if (path === "status" && request.method === "GET") {
      const [s] = await sql`SELECT * FROM lavik_email.settings WHERE id=true`;
      const [counts] =
        await sql`SELECT (SELECT count(*)::int FROM lavik_email.contacts) AS contacts,(SELECT count(*)::int FROM lavik_email.suppressions) AS suppressed,(SELECT count(*)::int FROM lavik_email.attempts WHERE started_at>now()-interval '24 hours') AS attempts24h`;
      return json({
        settings: s,
        ...counts,
        sender,
        outlookConfigured: configured(env),
      });
    }
    if (path === "settings" && request.method === "POST") {
      const s = settingsSchema.parse(await request.json());
      if (s.enabled && !configured(env))
        return json(
          {
            error: "Connect Outlook before enabling sending",
          },
          400,
        );
      await sql`UPDATE lavik_email.settings SET enabled=${s.enabled},postal_address=${s.postal_address},daily_limit=${s.daily_limit},interval_seconds=${s.interval_seconds},updated_at=now(),last_error=NULL WHERE id=true`;
      return json({ ok: true });
    }
    if (path === "contacts" && request.method === "GET") {
      const q = (url.searchParams.get("q") ?? "").slice(0, 100),
        domain = (url.searchParams.get("domain") ?? "")
          .toLowerCase()
          .slice(0, 253);
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(url.searchParams.get("offset") ?? 0);
      const contacts =
        await sql`SELECT c.email,c.first_name,c.last_name,c.domain,c.archived,s.reason AS suppression,
    EXISTS(SELECT 1 FROM lavik_email.recipients r WHERE r.email=c.email AND r.status IN ('accepted','sending','unknown','replied','bounced') AND r.attempt_at>now()-interval '30 days') AS recently_contacted
    FROM lavik_email.contacts c LEFT JOIN lavik_email.suppressions s ON s.email=c.email
    WHERE (${domain}='' OR c.domain=${domain}) AND (${q}='' OR concat_ws(' ',c.email,c.first_name,c.last_name) ILIKE ${"%" + q + "%"}) ORDER BY c.email LIMIT 51 OFFSET ${offset}`;
      return json({
        contacts: contacts.slice(0, 50),
        hasMore: contacts.length > 50,
        offset,
      });
    }
    if (path === "suppress" && request.method === "POST") {
      const b = z
        .object({
          email: z.email().max(254),
          reason: z.enum(["unsubscribe", "bounce", "reply", "manual"]),
        })
        .strict()
        .parse(await request.json());
      await sql`INSERT INTO lavik_email.suppressions(email,reason) VALUES(${b.email.toLowerCase()},${b.reason}) ON CONFLICT(email) DO NOTHING`;
      if (b.reason === "bounce" || b.reason === "reply")
        await sql`UPDATE lavik_email.recipients SET status=${b.reason === "bounce" ? "bounced" : "replied"} WHERE id=(SELECT id FROM lavik_email.recipients WHERE email=${b.email.toLowerCase()} AND status IN ('accepted','unknown') ORDER BY attempt_at DESC LIMIT 1)`;
      return json({ ok: true });
    }
    if (path === "jobs" && request.method === "GET") {
      const jobs =
        await sql`SELECT j.*,coalesce((SELECT jsonb_agg(t) FROM (SELECT variant,status,count(*)::int AS count FROM lavik_email.recipients WHERE job_id=j.id GROUP BY variant,status) t),'[]'::jsonb) AS counts FROM lavik_email.jobs j ORDER BY created_at DESC LIMIT 100`;
      return json({ jobs });
    }
    const match = path.match(
      /^jobs\/([a-f0-9-]+)(?:\/(start|pause|cancel|preview|recipients))?$/,
    );
    const id = match ? uuid.parse(match[1]) : null,
      action = match?.[2];
    if (
      (path === "jobs" && request.method === "POST") ||
      (id && !action && request.method === "PATCH")
    ) {
      const b = jobSchema.parse(await request.json());
      const catalogue = await platform(store, request, "catalogue");
      if (!catalogue.ok)
        return json({ error: "Published page catalogue unavailable" }, 503);
      const c = (await catalogue.json()) as {
        paths: string[];
        articles: { id: string }[];
        pages: { id: string }[];
      };
      if (
        !c.paths.includes(b.path) ||
        ![...c.articles, ...c.pages].some((v) => v.id === b.campaign)
      )
        return json(
          { error: "Choose a published Lavik page and campaign" },
          400,
        );
      const rows = id
        ? await sql`UPDATE lavik_email.jobs SET revision=revision+1,name=${b.name},content=${JSON.stringify(b.content)}::jsonb,audience=${JSON.stringify(b.audience)}::jsonb,campaign=${b.campaign},path=${b.path},scheduled_at=${b.scheduledAt ?? new Date().toISOString()}::timestamptz WHERE id=${id}::uuid AND status='draft' RETURNING id`
        : await sql`INSERT INTO lavik_email.jobs(name,content,audience,campaign,path,scheduled_at) VALUES(${b.name},${JSON.stringify(b.content)}::jsonb,${JSON.stringify(b.audience)}::jsonb,${b.campaign},${b.path},${b.scheduledAt ?? new Date().toISOString()}::timestamptz) RETURNING id`;
      return rows.length
        ? json(rows[0], id ? 200 : 201)
        : json(
            {
              error:
                "Only draft jobs can be edited. Clone this job to test new copy.",
            },
            409,
          );
    }
    if (!id) return json({ error: "Not found" }, 404);
    const [job] =
      await sql`SELECT * FROM lavik_email.jobs WHERE id=${id}::uuid`;
    if (!job) return json({ error: "Job not found" }, 404);
    if (action === "recipients" && request.method === "GET") {
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000)
        .parse(url.searchParams.get("offset") ?? 0);
      return json({
        recipients:
          await sql`SELECT id,email,variant,status,attempts,attempt_at,accepted_at,last_error FROM lavik_email.recipients WHERE job_id=${id}::uuid ORDER BY variant,email LIMIT 50 OFFSET ${offset}`,
      });
    }
    if (action === "preview" && request.method === "GET") {
      const [s] =
        await sql`SELECT postal_address FROM lavik_email.settings WHERE id=true`;
      return json({
        variants: Object.fromEntries(
          Object.entries(job.content).map(([key, value]) => [
            key,
            renderMessage(
              value as { subject: string; body: string },
              { first_name: "Alex", last_name: "Example" },
              job.links[key]?.url ??
                "https://lavik.dev/go/[generated-on-start]",
              "https://marketing.lavik.dev/email/unsubscribe/[personal-token]",
              s.postal_address,
            ),
          ]),
        ),
      });
    }
    if (action === "start" && request.method === "POST") {
      const [s] =
        await sql`SELECT enabled,postal_address FROM lavik_email.settings WHERE id=true`;
      if (!configured(env) || !s.enabled)
        return json(
          {
            error: "Connect Outlook and enable sending first",
          },
          400,
        );
      if (!["draft", "paused"].includes(job.status))
        return json({ error: "Only draft or paused jobs can start" }, 409);
      let tracked = job.links;
      if (job.status === "draft") {
        tracked = {};
        for (const variant of Object.keys(job.content)) {
          const code = `em-${id.replaceAll("-", "")}-${variant}`;
          const placements = await platform(store, request, "placements");
          const list = (await placements.json()) as {
            placements: { code: string }[];
          };
          if (!list.placements?.some((p) => p.code === code)) {
            const p = await platform(store, request, "placements", "POST", {
              code,
              source: "email",
              label: `${job.name.slice(0, 80)} · ${variant.toUpperCase()}`,
            });
            if (!p.ok)
              return json(
                {
                  error:
                    "Cannot register email placement. Check the placements limit.",
                },
                409,
              );
          }
          const response = await platform(store, request, "links", "POST", {
            campaign: job.campaign,
            path: job.path,
            placements: [code],
          });
          if (!response.ok)
            return json({ error: "Cannot generate email share links" }, 409);
          const data = (await response.json()) as {
            links: {
              placement: string;
              url: string;
              path: string;
              campaign: string;
            }[];
          };
          const link = data.links.find(
            (l) =>
              l.placement === code &&
              l.path === job.path &&
              l.campaign === job.campaign,
          );
          if (!link) return json({ error: "Share link was not returned" }, 503);
          tracked[variant] = { placement: code, url: link.url };
        }
      }
      const [started] =
        await sql`SELECT lavik_email.start_job(${id}::uuid,${JSON.stringify(tracked)}::jsonb,${job.revision}::int) AS enrolled`;
      return json({ ok: true, ...started });
    }
    if (
      (action === "pause" || action === "cancel") &&
      request.method === "POST"
    ) {
      await sql`UPDATE lavik_email.jobs SET status=${action === "pause" ? "paused" : "cancelled"} WHERE id=${id}::uuid AND status IN ('draft','running','paused','blocked')`;
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof z.ZodError)
      return json({ error: e.issues.map((i) => i.message).join("; ") }, 400);
    // PostgreSQL errors can include contact values: never expose or log them.
    return json(
      {
        error:
          "Email operation could not complete. Check job state and audience, then refresh.",
      },
      409,
    );
  }
}
export async function unsubscribe(request: Request, env: EmailEnv) {
  const url = new URL(request.url),
    token = url.pathname.split("/").at(-1);
  if (!uuid.safeParse(token).success || !env.EMAIL_DATABASE_URL)
    return new Response("Link unavailable", { status: 404 });
  const sql = database(env);
  const [r] =
    await sql`SELECT email FROM lavik_email.recipients WHERE token=${token}::uuid`;
  if (!r) return new Response("Link unavailable", { status: 404 });
  if (request.method === "POST") {
    if (Number(request.headers.get("Content-Length") ?? 0) > 1024)
      return new Response("Request too large", { status: 413 });
    await sql`INSERT INTO lavik_email.suppressions(email,reason) VALUES(${r.email},'unsubscribe') ON CONFLICT(email) DO NOTHING`;
    return new Response(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribed | Lavik</title><main><h1>You are unsubscribed.</h1><p>You will not receive further Lavik outreach emails.</p></main></html>',
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  if (request.method !== "GET") return new Response(null, { status: 405 });
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Unsubscribe | Lavik</title><main><h1>Stop Lavik outreach emails</h1><p>This applies to every Lavik email job.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
