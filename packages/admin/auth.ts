import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AuthConfig = {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
  ADMIN_LOCAL?: string;
  RUNNER_TOKEN?: string;
  PUBLISHER_TOKEN?: string;
};
const keys = new Map<string, JWTVerifyGetKey>();
export async function verifyAdmin(
  request: Request,
  env: AuthConfig,
  resolver?: JWTVerifyGetKey,
): Promise<string> {
  const url = new URL(request.url);
  if (
    env.ADMIN_LOCAL === "true" &&
    ["localhost", "127.0.0.1"].includes(url.hostname)
  )
    return "local-admin@example.test";
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ADMIN_EMAIL)
    throw new Error("Admin sign-in is not configured");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN))
    throw new Error("Invalid Access team domain");
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new Error("Sign in through Cloudflare Access");
  if (!resolver && !keys.has(issuer))
    keys.set(
      issuer,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
    );
  const { payload } = await jwtVerify(token, resolver ?? keys.get(issuer)!, {
    issuer,
    audience: env.ACCESS_AUD,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "email"],
    maxTokenAge: "24h",
  });
  const email = String(payload.email).toLowerCase();
  if (email !== env.ADMIN_EMAIL.toLowerCase())
    throw new Error("This account is not an administrator");
  return email;
}
export function validateMutation(request: Request) {
  if (["GET", "HEAD"].includes(request.method)) return;
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin)
    throw new Error("Same-origin request required");
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new Error("JSON request required");
}
export async function verifyRunner(request: Request, env: AuthConfig) {
  if (!env.RUNNER_TOKEN || env.RUNNER_TOKEN.length < 32) return false;
  const supplied =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const digest = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([
    digest(supplied),
    digest(env.RUNNER_TOKEN),
  ]);
  const left = new Uint8Array(a),
    right = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}
