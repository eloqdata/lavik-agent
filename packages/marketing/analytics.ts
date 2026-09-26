import { z } from "zod";
import type { Database } from "../admin/store";
import { json } from "../admin/store";
import { storedSources, storedMedia } from "./attribution";

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
  constructor(
    private state: {
      storage: Database & {
        getAlarm?(): Promise<number | null>;
        setAlarm?(at: number): Promise<void>;
      };
    },
  ) {
    state.storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS metrics (hour TEXT NOT NULL, source TEXT NOT NULL, medium TEXT NOT NULL, campaign TEXT NOT NULL, path TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(hour,source,medium,campaign,path,event));`,
    );
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
    if (request.method === "POST") {
      const parsed = analyticsEventSchema.safeParse(await request.json());
      if (!parsed.success) return json({ error: "Invalid event" }, 400);
      const a = parsed.data,
        now = new Date(),
        hour = `${now.toISOString().slice(0, 13)}:00:00.000Z`;
      this.state.storage.sql.exec(
        "INSERT INTO metrics(hour,source,medium,campaign,path,event,count) VALUES(?,?,?,?,?,?,1) ON CONFLICT(hour,source,medium,campaign,path,event) DO UPDATE SET count=count+1",
        hour,
        a.source,
        a.medium,
        a.campaign,
        a.path,
        a.event,
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
    try {
      const period = analyticsPeriod(
        url.searchParams.get("since") ?? undefined,
        url.searchParams.get("until") ?? undefined,
      );
      const rows = this.state.storage.sql
        .exec(
          "SELECT source,medium,campaign,path,event,SUM(count) AS count FROM metrics WHERE hour >= ? AND hour < ? GROUP BY source,medium,campaign,path,event ORDER BY source,campaign,path,event",
          period.since,
          period.until,
        )
        .toArray();
      return json({
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        ...period,
        timezone: "UTC",
        rows,
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
