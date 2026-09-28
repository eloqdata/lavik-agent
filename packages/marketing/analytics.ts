import { z } from "zod";
import type { Database } from "../admin/store";
import { json } from "../admin/store";
import { storedSources, storedMedia } from "./attribution";
import { PlatformAuth, PlatformError } from "./platform-auth";
import { PlacementStore } from "./placements";
import { publicRegistry } from "./dimensions";

export const analyticsEventSchema = z
  .object({
    event: z.enum([
      "visit",
      "pageview",
      "engaged",
      "install",
      "download",
      "github",
      "community",
    ]),
    path: z
      .string()
      .max(220)
      .regex(/^\/(en|zh-CN)\/(?:[a-z0-9][a-z0-9.-]*\/)*$/),
    source: z.enum(storedSources),
    medium: z.enum(storedMedia),
    campaign: z
      .string()
      .min(1)
      .max(90)
      .regex(/^[a-z0-9._-]+$/),
    placement: z
      .string()
      .max(40)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  .strict();
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export function analyticsPeriod(
  since?: string,
  until?: string,
  now = new Date(),
) {
  const end = until
    ? new Date(until)
    : new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const start = since
    ? new Date(since)
    : new Date(end.getTime() - 7 * 86_400_000);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start ||
    end.getTime() - start.getTime() > 90 * 86_400_000 ||
    end > now ||
    [start, end].some(
      (d) => d.getUTCMinutes() || d.getUTCSeconds() || d.getUTCMilliseconds(),
    )
  )
    throw new Error(
      "Use whole UTC hours, a past end time, and a range of 1 hour–90 days",
    );
  return { since: start.toISOString(), until: end.toISOString() };
}
export class AnalyticsStore {
  private auth: PlatformAuth;
  private placements: PlacementStore;
  constructor(
    private state: {
      storage: Database & {
        getAlarm?(): Promise<number | null>;
        setAlarm?(at: number): Promise<void>;
      };
    },
    private env?: { ASSETS: { fetch(request: Request): Promise<Response> } },
  ) {
    state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS metrics (hour TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, path TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(hour,source,medium,campaign,path,event));`,
    );
    const definition = state.storage.sql
      .exec<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='metrics'",
      )
      .toArray()[0].sql;
    if (!definition.includes("placement TEXT"))
      state.storage.transactionSync(() => {
        state.storage.sql.exec(
          "CREATE TABLE metrics_v2 (hour TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, path TEXT NOT NULL, event TEXT NOT NULL, placement TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(hour,source,medium,campaign,path,event,placement))",
        );
        state.storage.sql.exec(
          "INSERT INTO metrics_v2 SELECT hour,source,medium,campaign,path,event,'untagged',count FROM metrics",
        );
        state.storage.sql.exec("DROP TABLE metrics");
        state.storage.sql.exec("ALTER TABLE metrics_v2 RENAME TO metrics");
      });
    this.auth = new PlatformAuth(state.storage);
    this.placements = new PlacementStore(state.storage);
  }
  async alarm() {
    this.state.storage.sql.exec(
      "DELETE FROM metrics WHERE hour < ?",
      new Date(Date.now() - 180 * 86_400_000).toISOString(),
    );
    if (
      this.state.storage.sql
        .exec("SELECT 1 AS present FROM metrics LIMIT 1")
        .toArray().length
    )
      await this.state.storage.setAlarm?.(Date.now() + 86_400_000);
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/share/"))
      return this.placements.redirect(url.pathname.slice(7), request.method);
    if (url.pathname.startsWith("/platform/")) {
      try {
        const endpoint = url.pathname.slice(10);
        // Bootstrap is reachable only through the report-token-authenticated public-site Worker route.
        if (endpoint === "bootstrap" && request.method === "POST") {
          const body = z
            .object({ activationHash: z.string().regex(/^[a-f0-9]{64}$/) })
            .strict()
            .parse(await request.json());
          return this.auth.bootstrap(body.activationHash);
        }
        const response = await this.auth.route(request, endpoint);
        if (response) return response;
        this.auth.session(request);
        if (endpoint === "report" && request.method === "GET")
          return this.report(url, true);
        let registry;
        if (
          endpoint === "catalogue" ||
          (endpoint === "links" && request.method === "POST")
        ) {
          if (!this.env?.ASSETS)
            throw new PlatformError(503, "Public catalogue unavailable");
          registry = await publicRegistry(this.env.ASSETS);
        }
        if (endpoint === "catalogue" && request.method === "GET")
          return json({
            articles: registry!.articles,
            pages: registry!.pages,
            paths: [...registry!.paths].sort(),
          });
        return (
          (await this.placements.route(request, endpoint, registry)) ??
          json({ error: "Not found" }, 404)
        );
      } catch (e) {
        if (e instanceof PlatformError)
          return json({ error: e.message }, e.status);
        if (e instanceof z.ZodError)
          return json(
            { error: e.issues.map((i) => i.message).join("; ") },
            400,
          );
        return json({ error: "Request could not be completed" }, 400);
      }
    }
    if (request.method === "POST") {
      const parsed = analyticsEventSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: "Invalid event" }, 400);
      const a = parsed.data,
        now = new Date(),
        hour = `${now.toISOString().slice(0, 13)}:00:00.000Z`;
      this.state.storage.sql.exec(
        "INSERT INTO metrics(hour,source,medium,campaign,path,event,placement,count) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT(hour,source,medium,campaign,path,event,placement) DO UPDATE SET count=count+1",
        hour,
        a.source,
        a.medium,
        a.campaign,
        a.path,
        a.event,
        this.placements.normalize(a.placement, a.source),
      );
      // Aggregate rows only; no visitor IDs, addresses, user agents, or full URLs.
      this.state.storage.sql.exec(
        "DELETE FROM metrics WHERE hour < ?",
        new Date(now.getTime() - 180 * 86_400_000).toISOString(),
      );
      if (this.state.storage.getAlarm && !(await this.state.storage.getAlarm()))
        await this.state.storage.setAlarm?.(Date.now() + 86_400_000);
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return this.report(url);
  }
  private report(url: URL, live = false) {
    try {
      const now = new Date(),
        ceiling = new Date(Math.ceil(now.getTime() / 3600000) * 3600000);
      let until = url.searchParams.get("until") ?? undefined;
      if (live) {
        const requested = until ? new Date(until) : ceiling;
        if (
          !Number.isFinite(requested.getTime()) ||
          requested.getUTCMinutes() ||
          requested.getUTCSeconds() ||
          requested.getUTCMilliseconds() ||
          requested.getTime() > now.getTime() + 86400000
        )
          throw new Error(
            "Use UTC hour boundaries ending no later than tomorrow",
          );
        until = new Date(
          Math.min(requested.getTime(), ceiling.getTime()),
        ).toISOString();
      }
      const period = analyticsPeriod(
        url.searchParams.get("since") ?? undefined,
        until,
        live ? ceiling : now,
      );
      const bindings: (string | number | null)[] = [period.since, period.until];
      let filter = "hour >= ? AND hour < ?";
      for (const name of ["source", "campaign", "placement", "path"] as const) {
        const value = url.searchParams.get(name);
        if (value) {
          if (value.length > 220) throw new Error("Invalid filter");
          filter += ` AND ${name} = ?`;
          bindings.push(value);
        }
      }
      const rows = this.state.storage.sql
        .exec(
          `SELECT source,medium,campaign,path,event,placement,SUM(count) AS count FROM metrics WHERE ${filter} GROUP BY source,medium,campaign,path,event,placement ORDER BY source,campaign,placement,path,event`,
          ...bindings,
        )
        .toArray();
      const series = this.state.storage.sql
        .exec(
          `SELECT substr(hour,1,10) AS day,event,SUM(count) AS count FROM metrics WHERE ${filter} AND source != 'diagnostic' GROUP BY day,event ORDER BY day,event`,
          ...bindings,
        )
        .toArray();
      return json({
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        ...period,
        timezone: "UTC",
        rows,
        series,
        placements: this.placements.all(),
        provisional: live && period.until > now.toISOString(),
        dataThrough:
          period.until > now.toISOString() ? now.toISOString() : period.until,
        definitions: {
          visit:
            "A browser-tab visit, reset after 30 minutes of inactivity or a change in campaign/source; not unique people",
          engaged: "Visits with at least 20 visible seconds",
          install: "Visits reaching an installation guide",
          download:
            "Visits clicking a release artifact or Docker image link; not completed installations",
          direct:
            "No usable campaign or referrer; includes unattributed app and copied links",
        },
      });
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }
}
