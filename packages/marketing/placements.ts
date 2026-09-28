import { randomBytes } from "node:crypto";
import { z } from "zod";
import { json, type Database } from "../admin/store";
import { campaignSources, campaignUrl } from "./attribution";
import type { Registry } from "./dimensions";
import { PlatformError } from "./platform-auth";

export type Placement = {
  code: string;
  source: string;
  label: string;
  active: number;
  created: string;
};
export type ShareLink = {
  id: string;
  placement: string;
  source: string;
  campaign: string;
  path: string;
  active: number;
  created: string;
  label?: string;
};
const code = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,39}$/)
  .refine((v) => !["untagged", "unregistered", "diagnostic"].includes(v));
const label = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));

export class PlacementStore {
  constructor(private db: Database) {
    db.sql.exec(
      "CREATE TABLE IF NOT EXISTS marketing_placements (code TEXT PRIMARY KEY, source TEXT NOT NULL, label TEXT NOT NULL, active INTEGER NOT NULL, created TEXT NOT NULL)",
    );
    db.sql.exec(
      "CREATE TABLE IF NOT EXISTS marketing_links (id TEXT PRIMARY KEY, placement TEXT NOT NULL, source TEXT NOT NULL, campaign TEXT NOT NULL, path TEXT NOT NULL, active INTEGER NOT NULL, created TEXT NOT NULL, UNIQUE(placement,campaign,path))",
    );
    db.sql.exec(
      "CREATE TABLE IF NOT EXISTS marketing_schema (id TEXT PRIMARY KEY)",
    );
    if (
      !db.sql
        .exec("SELECT id FROM marketing_schema WHERE id='placements-seeded'")
        .toArray().length
    )
      db.transactionSync(() => {
        for (let i = 1; i <= 10; i++)
          this.insert(
            `wg${String(i).padStart(2, "0")}`,
            "wechat",
            `WeChat Group ${String(i).padStart(2, "0")}`,
          );
        for (const source of campaignSources.filter((s) => s !== "wechat"))
          this.insert(
            `${source}-main`,
            source,
            `${source === "x" ? "X" : source[0].toUpperCase() + source.slice(1)} main`,
          );
        db.sql.exec("INSERT INTO marketing_schema VALUES('placements-seeded')");
      });
  }
  private insert(code: string, source: string, label: string) {
    this.db.sql.exec(
      "INSERT OR IGNORE INTO marketing_placements VALUES(?,?,?,1,?)",
      code,
      source,
      label,
      new Date().toISOString(),
    );
  }
  all() {
    return this.db.sql
      .exec<Placement>(
        "SELECT * FROM marketing_placements ORDER BY source,code",
      )
      .toArray();
  }
  normalize(placement: string | undefined, source: string) {
    if (!placement || placement === "untagged") return "untagged";
    return this.db.sql
      .exec(
        "SELECT code FROM marketing_placements WHERE code=? AND source=?",
        placement,
        source,
      )
      .toArray().length
      ? placement
      : "unregistered";
  }
  links() {
    return this.db.sql
      .exec<ShareLink>(
        "SELECT l.*,p.label FROM marketing_links l JOIN marketing_placements p ON p.code=l.placement ORDER BY l.created DESC,l.id",
      )
      .toArray()
      .map((l) => ({
        ...l,
        url: `https://lavik.dev/go/${l.id}`,
        taggedUrl: this.target(l),
      }));
  }
  private target(link: ShareLink) {
    const url = new URL(
      campaignUrl(link.path, link.source, link.campaign, [link.campaign]),
    );
    url.searchParams.set("utm_content", link.placement);
    return url.href;
  }
  redirect(id: string, method: string) {
    if (!["GET", "HEAD"].includes(method))
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    if (!/^[a-f0-9]{20}$/.test(id))
      return new Response("Link not found", { status: 404 });
    const link = this.db.sql
      .exec<ShareLink>(
        "SELECT l.* FROM marketing_links l JOIN marketing_placements p ON p.code=l.placement WHERE l.id=? AND l.active=1 AND p.active=1",
        id,
      )
      .toArray()[0];
    if (!link)
      return new Response("This share link is unavailable", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    // Redirect requests and preview bots do not count as browser visits.
    return new Response(null, {
      status: 302,
      headers: {
        Location: this.target(link),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  async route(request: Request, endpoint: string, registry?: Registry) {
    if (endpoint === "placements" && request.method === "GET")
      return json({ placements: this.all() });
    if (endpoint === "placements" && request.method === "POST") {
      const body = z
        .object({ code, source: z.enum(campaignSources), label })
        .strict()
        .parse(await request.json());
      if (this.all().length >= 500)
        throw new PlatformError(400, "Placement limit reached (500)");
      if (this.all().some((p) => p.code === body.code))
        throw new PlatformError(409, "That placement code already exists");
      this.insert(body.code, body.source, body.label);
      return json({ placements: this.all() }, 201);
    }
    if (endpoint.startsWith("placements/") && request.method === "PATCH") {
      const id = endpoint.slice("placements/".length);
      const body = z
        .object({ label: label.optional(), active: z.boolean().optional() })
        .strict()
        .parse(await request.json());
      const previous = this.all().find((p) => p.code === id);
      if (!previous) throw new PlatformError(404, "Placement not found");
      this.db.sql.exec(
        "UPDATE marketing_placements SET label=?,active=? WHERE code=?",
        body.label ?? previous.label,
        body.active === undefined ? previous.active : Number(body.active),
        id,
      );
      return json({ placements: this.all() });
    }
    if (endpoint === "links" && request.method === "GET")
      return json({ links: this.links() });
    if (endpoint === "links" && request.method === "POST") {
      const body = z
        .object({
          campaign: z.string().max(90),
          path: z.string().max(220),
          placements: code.array().min(1).max(100),
        })
        .strict()
        .parse(await request.json());
      if (
        !registry?.campaigns.includes(body.campaign) ||
        !registry.paths.has(body.path)
      )
        throw new PlatformError(
          400,
          "Choose a published campaign and public Lavik page",
        );
      const placements = [...new Set(body.placements)].map((c) =>
        this.all().find((p) => p.code === c && p.active),
      );
      if (placements.some((p) => !p))
        throw new PlatformError(400, "Choose active placements");
      const count = this.db.sql
        .exec<{ n: number }>("SELECT count(*) AS n FROM marketing_links")
        .toArray()[0].n;
      if (count + placements.length > 10000)
        throw new PlatformError(400, "Share-link limit reached (10,000)");
      this.db.transactionSync(() => {
        for (const p of placements)
          this.db.sql.exec(
            "INSERT OR IGNORE INTO marketing_links VALUES(?,?,?,?,?,1,?)",
            randomBytes(10).toString("hex"),
            p!.code,
            p!.source,
            body.campaign,
            body.path,
            new Date().toISOString(),
          );
      });
      return json(
        {
          links: this.links().filter(
            (l) =>
              body.placements.includes(l.placement) &&
              l.campaign === body.campaign &&
              l.path === body.path,
          ),
        },
        201,
      );
    }
    if (endpoint.startsWith("links/") && request.method === "PATCH") {
      const id = endpoint.slice("links/".length);
      const body = z
        .object({ active: z.boolean() })
        .strict()
        .parse(await request.json());
      if (
        !this.db.sql
          .exec("SELECT id FROM marketing_links WHERE id=?", id)
          .toArray().length
      )
        throw new PlatformError(404, "Link not found");
      this.db.sql.exec(
        "UPDATE marketing_links SET active=? WHERE id=?",
        Number(body.active),
        id,
      );
      return json({ updated: true });
    }
    return null;
  }
}
