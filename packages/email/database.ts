import { neon, neonConfig } from "@neondatabase/serverless";
import type { EmailEnv } from "./model";
neonConfig.fetchFunction = (
  url: Parameters<typeof fetch>[0],
  options?: Parameters<typeof fetch>[1],
) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
export function database(env: EmailEnv) {
  if (!env.EMAIL_DATABASE_URL)
    throw new Error("Email database is not configured");
  return neon(env.EMAIL_DATABASE_URL);
}
