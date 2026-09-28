import fs from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import path from "node:path";
if (!process.argv.includes("--activate"))
  throw new Error(
    "Run marketing:setup -- --activate to create/rotate the initial activation link. This does not reset an activated account.",
  );
const secretDirectory = path.resolve(".secrets/marketing");
const credential = (
  await fs.readFile(path.join(secretDirectory, "report-token"), "utf8")
).trim();
const activation = randomBytes(32).toString("hex");
const response = await fetch(
  "https://lavik.dev/api/analytics/platform-bootstrap",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      activationHash: createHash("sha256").update(activation).digest("hex"),
    }),
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  },
);
if (!response.ok)
  throw new Error(
    `Activation failed: HTTP ${response.status}. An already activated account must use its password or recovery key.`,
  );
const url = `https://marketing.lavik.dev/#setup=${activation}`;
const file = path.join(secretDirectory, "activate.html");
await fs.writeFile(
  file,
  `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Activate Lavik Marketing</title><h1>Activate Lavik Marketing</h1><p>This private link expires after seven days or after you set your password. Do not share this file.</p><p><a href="${url}" rel="noreferrer">Open your private activation link</a></p><p>Sign in with username <b>admin</b> and password <b>admin</b>. Then set your own password and save the recovery key.</p>`,
  { mode: 0o600 },
);
await fs.chmod(file, 0o600);
console.log(
  `Private activation instructions saved to ${file}. No credentials were printed.`,
);
