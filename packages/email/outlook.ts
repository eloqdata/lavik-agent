import { Buffer } from "node:buffer";
import { configured, sender, type EmailEnv, retryAt } from "./model";
export async function outlookToken(
  env: EmailEnv,
  request: typeof fetch = fetch,
) {
  if (!configured(env) || !/^[a-f0-9-]{36}$/i.test(env.OUTLOOK_TENANT_ID!))
    throw new Error("Outlook connection is not configured");
  const r = await request(
    `https://login.microsoftonline.com/${env.OUTLOOK_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({
        client_id: env.OUTLOOK_CLIENT_ID!,
        client_secret: env.OUTLOOK_CLIENT_SECRET!,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
    },
  );
  if (!r.ok) throw new Error("Outlook authentication failed");
  const b = (await r.json()) as { access_token?: string };
  if (!b.access_token) throw new Error("Outlook authentication failed");
  return b.access_token;
}
export function mimeMessage(input: {
  id: string;
  to: string;
  subject: string;
  body: string;
  unsubscribe: string;
}) {
  if (/[\r\n]/.test(input.to) || !input.to.includes("@"))
    throw new Error("Invalid recipient");
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const fold = (s: string) => s.match(/.{1,76}/g)?.join("\r\n") ?? "";
  const words: string[] = [];
  let part = "";
  for (const char of input.subject) {
    if (Buffer.byteLength(part + char) > 42) {
      words.push("=?UTF-8?B?" + b64(part) + "?=");
      part = "";
    }
    part += char;
  }
  if (part) words.push("=?UTF-8?B?" + b64(part) + "?=");
  const mime = [
    `From: Hubert Zhang <${sender}>`,
    `To: <${input.to}>`,
    `Subject: ${words.join("\r\n ")}`,
    `Message-ID: <${input.id}@lavik.dev>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    `List-Unsubscribe: <${input.unsubscribe}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
    `X-Lavik-Message: ${input.id}`,
    "",
    fold(b64(input.body)),
  ].join("\r\n");
  return b64(mime);
}
export async function sendOutlook(
  token: string,
  message: Parameters<typeof mimeMessage>[0],
  request: typeof fetch = fetch,
) {
  try {
    const r = await request(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "text/plain",
        },
        body: mimeMessage(message),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (r.status === 202) return { status: "accepted" as const };
    if (r.status === 429)
      return {
        status: "throttled" as const,
        retry: retryAt(r.headers.get("Retry-After")),
      };
    if (r.status === 401 || r.status === 403)
      return {
        status: "blocked" as const,
        code: `Outlook ${r.status}: check mailbox authorization`,
      };
    if (r.status >= 400 && r.status < 500)
      return {
        status: "rejected" as const,
        code: `Outlook rejected request (${r.status})`,
      };
    return {
      status: "unknown" as const,
      code: `Uncertain Outlook outcome (${r.status}); check Sent Items`,
    };
  } catch {
    return {
      status: "unknown" as const,
      code: "Connection interrupted; check Sent Items before resending",
    };
  }
}
