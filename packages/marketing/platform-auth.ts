import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { json, type Database } from "../admin/store";

export const platformOrigin = "https://marketing.lavik.dev";
export const token = () => randomBytes(32).toString("hex");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const password = z
  .string()
  .min(9, "Use at least 9 characters")
  .max(128)
  .refine((v) => v.trim().length >= 9, "Use at least 9 non-padding characters");
type Account = {
  hash: string;
  setupHash: string | null;
  setupExpires: number;
  recoveryHash: string | null;
  version: number;
};
type Session = {
  id: string;
  csrf: string;
  expires: number;
  version: number;
  setup: number;
};

export class PlatformError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function platformLocal(request: Request) {
  return new URL(request.url).origin === "http://127.0.0.1:4175";
}
const cookieName = (r: Request) =>
  platformLocal(r) ? "lavik_marketing_local" : "__Host-lavik_marketing";
function cookie(r: Request, value: string, seconds: number) {
  return `${cookieName(r)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${platformLocal(r) ? "" : "; Secure"}`;
}
function hashPassword(value: string, salt = randomBytes(16).toString("hex")) {
  // OWASP's 32 MiB scrypt profile; synchronous computation also bounds concurrent memory in this object.
  const hash = scryptSync(value, salt, 32, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
  return `${salt}:${hash}`;
}
function checkPassword(value: string, hash: string) {
  return equal(hashPassword(value, hash.split(":")[0]), hash);
}
export class PlatformAuth {
  constructor(private db: Database) {
    db.sql.exec(
      "CREATE TABLE IF NOT EXISTS marketing_account (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL)",
    );
    db.sql.exec(
      "CREATE TABLE IF NOT EXISTS marketing_sessions (id TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL, version INTEGER NOT NULL, setup INTEGER NOT NULL)",
    );
    db.sql.exec(
      "CREATE TABLE IF NOT EXISTS marketing_attempts (id INTEGER PRIMARY KEY CHECK(id=1), started INTEGER NOT NULL, attempts INTEGER NOT NULL)",
    );
  }
  account(): Account | undefined {
    const row = this.db.sql
      .exec<{ body: string }>("SELECT body FROM marketing_account WHERE id=1")
      .toArray()[0];
    return row ? JSON.parse(row.body) : undefined;
  }
  private save(account: Account) {
    this.db.sql.exec(
      "INSERT INTO marketing_account(id,body) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      JSON.stringify(account),
    );
  }
  bootstrap(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash))
      throw new PlatformError(400, "Invalid activation hash");
    const existing = this.account();
    if (existing && !existing.setupHash)
      throw new PlatformError(
        409,
        "Admin is already activated; use password recovery",
      );
    this.db.transactionSync(() => {
      this.save({
        hash: hashPassword("admin"),
        setupHash: hash,
        setupExpires: Date.now() + 7 * 86400000,
        recoveryHash: null,
        version: (existing?.version ?? 0) + 1,
      });
      this.db.sql.exec("DELETE FROM marketing_sessions");
      this.db.sql.exec("DELETE FROM marketing_attempts");
    });
    return json({ activated: false, activationExpiresInDays: 7 });
  }
  session(request: Request, allowSetup = false): Session {
    const value = request.headers
      .get("Cookie")
      ?.split(";")
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${cookieName(request)}=`))
      ?.slice(cookieName(request).length + 1);
    if (!value || !/^[a-f0-9]{64}$/.test(value))
      throw new PlatformError(401, "Please sign in");
    const session = this.db.sql
      .exec<Session>(
        "SELECT * FROM marketing_sessions WHERE id=?",
        digest(value),
      )
      .toArray()[0];
    const account = this.account();
    if (
      !session ||
      session.expires <= Date.now() ||
      !account ||
      session.version !== account.version
    )
      throw new PlatformError(
        401,
        "Your session expired. Please sign in again",
      );
    if (session.setup && !allowSetup)
      throw new PlatformError(
        403,
        "Change the initial password before opening the dashboard",
      );
    if (
      !["GET", "HEAD"].includes(request.method) &&
      !equal(request.headers.get("X-CSRF-Token") ?? "", session.csrf)
    )
      throw new PlatformError(403, "Invalid request token. Refresh the page");
    return session;
  }
  private throttle() {
    const now = Date.now();
    this.db.sql.exec(
      "DELETE FROM marketing_attempts WHERE started < ?",
      now - 15 * 60000,
    );
    this.db.sql.exec(
      "INSERT INTO marketing_attempts VALUES(1,?,1) ON CONFLICT(id) DO UPDATE SET attempts=attempts+1",
      now,
    );
    const n = this.db.sql
      .exec<{ attempts: number }>(
        "SELECT attempts FROM marketing_attempts WHERE id=1",
      )
      .toArray()[0].attempts;
    if (n > 20)
      throw new PlatformError(
        429,
        "Too many sign-in attempts. Try again in 15 minutes",
      );
  }
  private issue(
    request: Request,
    account: Account,
    extra: Record<string, unknown> = {},
  ) {
    const raw = token(),
      csrf = token(),
      setup = !!account.setupHash,
      seconds = setup ? 900 : 8 * 3600;
    this.db.sql.exec(
      "DELETE FROM marketing_sessions WHERE expires <= ?",
      Date.now(),
    );
    this.db.sql.exec(
      "DELETE FROM marketing_sessions WHERE id NOT IN (SELECT id FROM marketing_sessions ORDER BY expires DESC LIMIT 15)",
    );
    this.db.sql.exec(
      "INSERT INTO marketing_sessions VALUES(?,?,?,?,?)",
      digest(raw),
      csrf,
      Date.now() + seconds * 1000,
      account.version,
      Number(setup),
    );
    const response = json({
      user: "admin",
      mustChangePassword: setup,
      csrf,
      ...extra,
    });
    response.headers.set("Set-Cookie", cookie(request, raw, seconds));
    return response;
  }
  async route(request: Request, endpoint: string): Promise<Response | null> {
    if (endpoint === "session" && request.method === "GET") {
      const s = this.session(request, true);
      return json({
        user: "admin",
        mustChangePassword: !!s.setup,
        csrf: s.csrf,
        expires: s.expires,
      });
    }
    if (endpoint === "login" && request.method === "POST") {
      const body = z
        .object({
          username: z.literal("admin"),
          password: z.string().max(128),
          activation: z.string().max(128).optional(),
        })
        .strict()
        .safeParse(await request.json());
      this.throttle();
      const account = this.account();
      if (
        !body.success ||
        !account ||
        (account.setupHash &&
          (account.setupExpires <= Date.now() ||
            !equal(digest(body.data.activation ?? ""), account.setupHash))) ||
        !checkPassword(body.data.password, account.hash)
      )
        throw new PlatformError(
          401,
          "Sign-in failed. First-time setup also requires your private activation link",
        );
      this.db.sql.exec("DELETE FROM marketing_attempts");
      return this.issue(request, account);
    }
    if (endpoint === "logout" && request.method === "POST") {
      const session = this.session(request, true);
      this.db.sql.exec("DELETE FROM marketing_sessions WHERE id=?", session.id);
      const response = json({ signedOut: true });
      response.headers.set("Set-Cookie", cookie(request, "", 0));
      return response;
    }
    if (endpoint === "password" && request.method === "POST") {
      this.session(request, true);
      const body = z
        .object({ currentPassword: z.string().max(128), newPassword: password })
        .strict()
        .parse(await request.json());
      this.throttle();
      const account = this.account()!;
      if (!checkPassword(body.currentPassword, account.hash))
        throw new PlatformError(401, "Current password is incorrect");
      if (body.currentPassword === body.newPassword)
        throw new PlatformError(400, "Choose a different password");
      const recoveryKey = token();
      const next: Account = {
        hash: hashPassword(body.newPassword),
        setupHash: null,
        setupExpires: 0,
        recoveryHash: digest(recoveryKey),
        version: account.version + 1,
      };
      this.db.transactionSync(() => {
        this.save(next);
        this.db.sql.exec("DELETE FROM marketing_sessions");
        this.db.sql.exec("DELETE FROM marketing_attempts");
      });
      return this.issue(request, next, { recoveryKey });
    }
    if (endpoint === "recover" && request.method === "POST") {
      const body = z
        .object({
          username: z.literal("admin"),
          recoveryKey: z.string().length(64),
          newPassword: password,
        })
        .strict()
        .parse(await request.json());
      this.throttle();
      const account = this.account();
      if (
        !account?.recoveryHash ||
        !equal(digest(body.recoveryKey), account.recoveryHash)
      )
        throw new PlatformError(401, "Invalid recovery key");
      const recoveryKey = token();
      const next: Account = {
        hash: hashPassword(body.newPassword),
        setupHash: null,
        setupExpires: 0,
        recoveryHash: digest(recoveryKey),
        version: account.version + 1,
      };
      this.db.transactionSync(() => {
        this.save(next);
        this.db.sql.exec("DELETE FROM marketing_sessions");
        this.db.sql.exec("DELETE FROM marketing_attempts");
      });
      return this.issue(request, next, { recoveryKey });
    }
    return null;
  }
}
