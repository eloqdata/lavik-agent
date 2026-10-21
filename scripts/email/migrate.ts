import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { localConnection } from "./connection";
try {
  const sql = neon(localConnection());
  // One server-side transaction; this script touches only the dedicated schema.
  const source = readFileSync("packages/email/schema.sql", "utf8");
  const statements: string[] = [];
  let start = 0,
    dollar = false;
  for (let i = 0; i < source.length; i++) {
    if (source.slice(i, i + 2) === "$$") {
      dollar = !dollar;
      i++;
    } else if (source[i] === ";" && !dollar) {
      statements.push(source.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (source.slice(start).trim()) statements.push(source.slice(start));
  await sql.transaction(statements.map((text) => sql.query(text)));
  console.log(
    "Email schema migration completed. Sending is disabled by default.",
  );
} catch (e) {
  console.error(
    "Migration failed; no credentials or database response printed.",
    (e as { code?: string }).code ?? "",
  );
  process.exitCode = 1;
}
