import test from "node:test";
import assert from "node:assert/strict";
import { normalizeContact } from "../packages/email/contact";
import { jobSchema, renderMessage, retryAt } from "../packages/email/model";
import { mimeMessage, sendOutlook } from "../packages/email/outlook";
import { emailApi } from "../packages/email/api";
import worker from "../apps/marketing/worker";
import { campaignUrl, attribution } from "../packages/marketing/attribution";
const message = {
  id: "11111111-1111-4111-8111-111111111111",
  to: "engineer@example.invalid",
  subject: "Lavik NVMe",
  body: "Hello",
  unsubscribe:
    "https://marketing.lavik.dev/email/unsubscribe/11111111-1111-4111-8111-111111111111",
};
test("CRM import normalizes addresses, respects opt-outs, and rejects malformed entries", () => {
  const c = normalizeContact({
    id: "1",
    properties: {
      email: " Engineer@Example.com ",
      firstname: "Test\nName",
      hs_email_optout: "true",
    },
  });
  assert.equal(c?.email, "engineer@example.com");
  assert.equal(c?.first_name, "TestName");
  assert.equal(c?.suppressed, true);
  for (const email of [
    "a@",
    "a b@example.com",
    "a@example..com",
    "a@example.com\r\nBcc: b@bad.com",
  ])
    assert.equal(normalizeContact({ properties: { email } }), null);
});
test("templates require a tracked destination and support only approved fields", () => {
  const job = {
    name: "Test",
    content: { a: { subject: "Hello {{first_name}}", body: "Read {{link}}" } },
    audience: { domain: "", search: "", limit: 100 },
    campaign: "landing",
    path: "/en/",
  };
  assert.ok(jobSchema.safeParse(job).success);
  assert.equal(
    jobSchema.safeParse({
      ...job,
      content: { a: { subject: "Hello", body: "No link" } },
    }).success,
    false,
  );
  assert.equal(
    jobSchema.safeParse({
      ...job,
      content: { a: { subject: "Hello\r\nBcc: bad", body: "{{link}}" } },
    }).success,
    false,
  );
  assert.equal(
    jobSchema.safeParse({
      ...job,
      content: { a: { subject: "Hello", body: "{{unknown}} {{link}}" } },
    }).success,
    false,
  );
  const out = renderMessage(
    job.content.a,
    { first_name: "", last_name: "" },
    "https://lavik.dev/go/abc",
    message.unsubscribe,
    "Company address",
  );
  assert.equal(out.subject, "Hello there");
  assert.match(out.body, /Company address/);
  assert.match(out.body, /unsubscribe/);
  const noAddress = renderMessage(
    job.content.a,
    { first_name: "", last_name: "" },
    "https://lavik.dev/go/abc",
    message.unsubscribe,
    "",
  );
  assert.match(noAddress.body, /Hubert Zhang \| EloqData\n\nTo stop receiving/);
  assert.ok(!noAddress.body.includes("[Company postal address]"));
});
test("email jobs use existing registered share-link attribution without recipient identifiers", () => {
  const url = campaignUrl("/en/", "email", "landing", ["landing"]);
  const u = new URL(url);
  u.searchParams.set("utm_content", "em-example-a");
  assert.deepEqual(attribution(u.href, "", ["landing"]), {
    source: "email",
    medium: "email",
    campaign: "landing",
    placement: "em-example-a",
  });
  assert.ok(!u.href.includes("@"));
});
test("MIME includes one-click unsubscribe and folds UTF-8 subjects safely", () => {
  const raw = Buffer.from(
    mimeMessage({ ...message, subject: "测试".repeat(80) }),
    "base64",
  ).toString("utf8");
  assert.match(raw, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/);
  assert.match(raw, /From: Hubert Zhang <hubertzhang@eloqdata.com>/);
  assert.ok(raw.split("\r\n").every((line) => Buffer.byteLength(line) < 998));
  assert.throws(() =>
    mimeMessage({ ...message, to: "a@example.com\r\nBcc:bad@example.com" }),
  );
});
test("Outlook accepts are not delivery claims; throttles and ambiguous outcomes differ", async () => {
  for (const [code, status] of [
    [202, "accepted"],
    [429, "throttled"],
    [401, "blocked"],
    [403, "blocked"],
    [400, "rejected"],
    [503, "unknown"],
  ] as const) {
    const r = await sendOutlook(
      "test",
      message,
      async () =>
        new Response(null, { status: code, headers: { "Retry-After": "600" } }),
    );
    assert.equal(r.status, status);
  }
  const failed = await sendOutlook("test", message, async () => {
    throw new Error("network");
  });
  assert.equal(failed.status, "unknown");
  const now = Date.now();
  assert.equal(retryAt("600", now).getTime(), now + 600000);
  assert.ok(
    retryAt(new Date(now + 7200000).toUTCString(), now).getTime() >=
      now + 7199000,
  );
});
test("email API requires an established admin session and CSRF before database access", async () => {
  const request = new Request(
    "https://marketing.lavik.dev/api/email/settings",
    { method: "POST" },
  );
  const denied = await emailApi(
    request,
    {},
    { fetch: async () => Response.json({ error: "Sign in" }, { status: 401 }) },
  );
  assert.equal(denied.status, 401);
  const setup = await emailApi(
    request,
    {},
    {
      fetch: async () =>
        Response.json({ mustChangePassword: true, csrf: "token" }),
    },
  );
  assert.equal(setup.status, 403);
  const csrf = await emailApi(
    request,
    {},
    {
      fetch: async () =>
        Response.json({ mustChangePassword: false, csrf: "token" }),
    },
  );
  assert.equal(csrf.status, 403);
  const env = {
    ASSETS: { fetch: async () => new Response() },
    ANALYTICS_STORE: {
      idFromName: () => "",
      get: () => ({ fetch: async () => new Response(null, { status: 401 }) }),
    },
  };
  const cross = await worker.fetch(
    new Request(request.url, {
      method: "POST",
      headers: {
        Origin: "https://evil.invalid",
        "Content-Type": "application/json",
        "Sec-Fetch-Site": "cross-site",
      },
      body: "{}",
    }),
    env,
  );
  assert.equal(cross.status, 403);
  const contacts = await worker.fetch(
    new Request("https://marketing.lavik.dev/api/email/contacts"),
    env,
  );
  assert.equal(contacts.status, 401);
  assert.match(contacts.headers.get("X-Robots-Tag")!, /noindex/);
});
