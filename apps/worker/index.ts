import {
  verifyAdmin,
  verifyRunner,
  validateMutation,
  type AuthConfig,
} from "../../packages/admin/auth.ts";
import { TaskStore, json, type Database } from "../../packages/admin/store.ts";

type Fetcher = { fetch(request: Request): Promise<Response> };
type Env = AuthConfig & {
  ASSETS: Fetcher;
  ADMIN_STORE: { idFromName(name: string): unknown; get(id: unknown): Fetcher };
};
export class AdminStore {
  private store: TaskStore;
  constructor(state: { storage: Database }) {
    this.store = new TaskStore(state.storage);
  }
  fetch(request: Request) {
    return this.store.fetch(request);
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    const admin =
      path === "/admin" ||
      path.startsWith("/admin/") ||
      path.startsWith("/api/admin/");
    const runner = path.startsWith("/api/runner/");
    if (!admin && !runner) return env.ASSETS.fetch(request);
    if (Number(request.headers.get("content-length") ?? 0) > 1_000_000)
      return json({ error: "Request too large" }, 413);
    const headers = new Headers({ "Content-Type": "application/json" });
    if (runner) {
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
