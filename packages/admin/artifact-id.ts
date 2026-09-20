import { resultSchema, type TaskResult } from "./contracts.ts";

// Shared by the Cloudflare outbox and the Node publisher. Schema order makes
// the digest independent of JSON key order supplied by the transport.
export async function artifactHash(result: TaskResult) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(resultSchema.parse(result)),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
