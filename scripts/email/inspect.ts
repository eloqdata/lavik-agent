import { neon } from "@neondatabase/serverless";
import { localConnection } from "./connection";
try {
  const sql = neon(localConnection());
  const tables =
    await sql`SELECT table_schema, count(*)::int AS tables FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') GROUP BY table_schema`;
  console.log(JSON.stringify({ connected: true, schemas: tables }));
} catch {
  console.error(
    "Neon connection failed; credentials and server response withheld.",
  );
  process.exitCode = 1;
}
