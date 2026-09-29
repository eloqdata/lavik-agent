import { json } from "../../packages/admin/store";
import { platformOrigin } from "../../packages/marketing/platform-auth";

type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ANALYTICS_STORE: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
  MARKETING_LOCAL?: string;
  MARKETING_AUTH_LIMIT?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
};
const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url),
      local =
        env.MARKETING_LOCAL === "true" &&
        url.origin === "http://127.0.0.1:4175";
    if (url.origin !== platformOrigin && !local)
      return new Response("Unknown host", { status: 404 });
    let response: Response;
    if (url.pathname.startsWith("/api/")) {
      const endpoint = url.pathname.slice(5);
      // The internal bootstrap route can never be reached from this public console.
      if (
        !/^(session|login|logout|password|recover|report|catalogue|placements(?:\/[a-z0-9-]+)?|links(?:\/[a-f0-9]+)?)$/.test(
          endpoint,
        )
      )
        response = json({ error: "Not found" }, 404);
      else if (!["GET", "POST", "PATCH"].includes(request.method))
        response = json({ error: "Method not allowed" }, 405);
      else if (
        request.method !== "GET" &&
        (request.headers.get("Origin") !== url.origin ||
          request.headers.get("Sec-Fetch-Site") !== "same-origin" ||
          !request.headers.get("Content-Type")?.startsWith("application/json"))
      )
        response = json({ error: "Same-origin JSON request required" }, 403);
      else if (
        request.method !== "GET" &&
        Number(request.headers.get("Content-Length") ?? 0) > 16384
      )
        response = json({ error: "Request too large" }, 413);
      else {
        if (
          ["login", "recover", "password"].includes(endpoint) &&
          env.MARKETING_AUTH_LIMIT &&
          !(
            await env.MARKETING_AUTH_LIMIT.limit({
              key: request.headers.get("CF-Connecting-IP") ?? "unknown",
            })
          ).success
        )
          response = json(
            { error: "Too many attempts. Please wait a minute" },
            429,
          );
        else {
          const body =
            request.method === "GET" ? undefined : await request.text();
          if (body && new TextEncoder().encode(body).length > 16384)
            response = json({ error: "Request too large" }, 413);
          else {
            url.pathname = `/platform/${endpoint}`;
            response = await env.ANALYTICS_STORE.get(
              env.ANALYTICS_STORE.idFromName("lavik-marketing-v1"),
            ).fetch(
              new Request(url, {
                method: request.method,
                headers: request.headers,
                body,
              }),
            );
          }
        }
      }
    } else if (url.pathname === "/robots.txt")
      response = new Response("User-agent: *\nDisallow: /\n", {
        headers: { "Content-Type": "text/plain" },
      });
    else if (
      [
        "/",
        "/index.html",
        "/app.js",
        "/style.css",
        "/qr.js",
        "/logo.svg",
        "/version.json",
      ].includes(url.pathname) &&
      ["GET", "HEAD"].includes(request.method)
    ) {
      if (url.pathname === "/") url.pathname = "/index.html";
      response = await env.ASSETS.fetch(new Request(url, request));
    } else response = new Response("Not found", { status: 404 });
    const result = new Response(response.body, response);
    for (const [name, value] of Object.entries(headers))
      result.headers.set(name, value);
    return result;
  },
};
