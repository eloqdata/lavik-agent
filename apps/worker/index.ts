import {
  analyticsEventSchema,
  AnalyticsStore,
} from "../../packages/marketing/analytics";
export { AnalyticsStore };
import { publicDimensions } from "../../packages/marketing/dimensions";
import {
  verifyAdmin,
  verifyRunner,
  validateMutation,
  type AuthConfig,
} from "../../packages/admin/auth.ts";
import { TaskStore, json, type Database } from "../../packages/admin/store.ts";
import {
  WorkerDispatcher,
  type AlarmStorage,
  type DispatchConfig,
} from "../../packages/admin/dispatch.ts";
import { communityRedirect } from "../../packages/community/links.ts";

type Fetcher = { fetch(request: Request): Promise<Response> };
const disabled = () =>
  json(
    {
      error: "Lavik Admin is disabled. Content work is moving to local Codex.",
    },
    410,
  );
type Env = AuthConfig &
  DispatchConfig & {
    ASSETS: Fetcher;
    ANALYTICS_REPORT_TOKEN?: string;
    ANALYTICS_STORE?: {
      idFromName(name: string): unknown;
      get(id: unknown): Fetcher;
    };
    ANALYTICS_RATE_LIMIT?: {
      limit(options: { key: string }): Promise<{ success: boolean }>;
    };
    ADMIN_STORE: {
      idFromName(name: string): unknown;
      get(id: unknown): Fetcher;
    };
  };
export class AdminStore {
  private store: TaskStore;
  private dispatcher: WorkerDispatcher;
  constructor(
    state: { storage: Database & AlarmStorage },
    private env: DispatchConfig,
  ) {
    this.store = new TaskStore(state.storage);
    this.dispatcher = new WorkerDispatcher(this.store, state.storage, env);
  }
  async fetch(request: Request) {
    if (this.env.ADMIN_ENABLED !== "true") {
      await this.dispatcher.ensureAlarm();
      return disabled();
    }
    // Also recovers pre-existing queues when deploying the dispatcher.
    const work = this.store.workStatus();
    if (
      request.method === "POST" ||
      work.queued ||
      work.running ||
      work.probe ||
      work.publications
    )
      await this.dispatcher.ensureAlarm();
    return this.store.fetch(request);
  }
  alarm() {
    return this.dispatcher.alarm();
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const analyticsPath = new URL(request.url).pathname;
    if (analyticsPath.startsWith("/api/analytics/")) {
      if (!env.ANALYTICS_STORE)
        return json({ error: "Analytics is unavailable" }, 503);
      const store = env.ANALYTICS_STORE.get(
        env.ANALYTICS_STORE.idFromName("lavik-marketing-v1"),
      );
      if (
        analyticsPath === "/api/analytics/report" &&
        request.method === "GET"
      ) {
        if (
          !(await verifyRunner(request, {
            RUNNER_TOKEN: env.ANALYTICS_REPORT_TOKEN,
          }))
        )
          return json({ error: "Report authentication required" }, 401);
        return store.fetch(request);
      }
      if (analyticsPath !== "/api/analytics/event" || request.method !== "POST")
        return json({ error: "Not found" }, 404);
      const origin = new URL(request.url).origin;
      if (
        request.headers.get("Origin") !== origin ||
        request.headers.get("Sec-Fetch-Site") !== "same-origin"
      )
        return json({ error: "Same-origin browser request required" }, 403);
      if (
        !request.headers.get("Content-Type")?.startsWith("application/json") ||
        Number(request.headers.get("Content-Length") ?? 0) > 2048
      )
        return json({ error: "Invalid event body" }, 400);
      if (
        env.ANALYTICS_RATE_LIMIT &&
        !(
          await env.ANALYTICS_RATE_LIMIT.limit({
            key: request.headers.get("CF-Connecting-IP") ?? "unknown",
          })
        ).success
      )
        return new Response(null, { status: 429 });
      const body = await request.text();
      if (new TextEncoder().encode(body).length > 2048)
        return json({ error: "Event too large" }, 413);
      try {
        const parsed = analyticsEventSchema.safeParse(JSON.parse(body));
        if (!parsed.success) return json({ error: "Invalid event" }, 400);
        let normalized;
        try {
          normalized = await publicDimensions(env.ASSETS, parsed.data);
        } catch {
          return json({ error: "Attribution registry unavailable" }, 503);
        }
        if (!normalized) return json({ error: "Unknown public page" }, 400);
        return store.fetch(
          new Request(request.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(normalized),
          }),
        );
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
    }
    const community = communityRedirect(request);
    if (community) return community;
    const path = new URL(request.url).pathname;
    const admin =
      path === "/admin" ||
      path.startsWith("/admin/") ||
      path.startsWith("/api/admin/");
    const runner = path.startsWith("/api/runner/");
    const publisher = path.startsWith("/api/publisher/");
    if (!admin && !runner && !publisher) return env.ASSETS.fetch(request);
    if (env.ADMIN_ENABLED !== "true") return disabled();
    if (Number(request.headers.get("content-length") ?? 0) > 1_000_000)
      return json({ error: "Request too large" }, 413);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (publisher) {
      if (!(await verifyRunner(request, { RUNNER_TOKEN: env.PUBLISHER_TOKEN })))
        return json({ error: "Publisher authentication required" }, 401);
      headers.set("X-Publisher-Authorized", "true");
    } else if (runner) {
      if (!(await verifyRunner(request, env)))
        return json({ error: "Worker authentication required" }, 401);
      headers.set("X-Runner-Authorized", "true");
    } else {
      try {
        headers.set("X-Admin-Actor", await verifyAdmin(request, env));
        validateMutation(request);
      } catch {
        return json(
          {
            error:
              env.ACCESS_AUD || env.ADMIN_LOCAL === "true"
                ? "Admin sign-in required"
                : "Admin sign-in setup is pending. The public website is available.",
          },
          env.ACCESS_AUD || env.ADMIN_LOCAL === "true" ? 403 : 503,
        );
      }
      if (!path.startsWith("/api/")) {
        const asset = await env.ASSETS.fetch(request);
        const response = new Response(asset.body, asset);
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Robots-Tag", "noindex, nofollow");
        return response;
      }
    }
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method not allowed" }, 405);
    let body: string | undefined;
    if (request.method === "POST") {
      body = await request.text();
      if (new TextEncoder().encode(body).length > 1_000_000)
        return json({ error: "Request too large" }, 413);
      try {
        JSON.parse(body);
      } catch {
        return json({ error: "Invalid JSON" }, 400);
      }
    }
    const stub = env.ADMIN_STORE.get(
      env.ADMIN_STORE.idFromName("lavik-admin-v1"),
    );
    return stub.fetch(
      new Request(request.url, { method: request.method, headers, body }),
    );
  },
};
