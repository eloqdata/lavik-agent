import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { localConnection } from "./connection";
import { normalizeContact } from "../../packages/email/contact";
// Never print raw contacts, connection strings, SQL parameters, or database errors.
async function run() {
  const sql = neon(localConnection()),
    digest = createHash("sha256");
  let lines = 0,
    valid = 0,
    skipped = 0,
    malformed = 0;
  const batch = new Map<
    string,
    NonNullable<ReturnType<typeof normalizeContact>>
  >();
  const flush = async () => {
    if (!batch.size) return;
    const rows = [...batch.values()];
    for (let attempt = 0; ; attempt++) {
      try {
        await sql.transaction([
          sql.query(
            `INSERT INTO lavik_email.contacts(email,domain,first_name,last_name,source_id,source_updated_at,archived)
    SELECT email,domain,first_name,last_name,source_id,source_updated_at::timestamptz,archived
    FROM jsonb_to_recordset($1::jsonb) AS r(email text,domain text,first_name text,last_name text,source_id text,source_updated_at text,archived boolean)
    ON CONFLICT(email) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,source_id=EXCLUDED.source_id,
    source_updated_at=EXCLUDED.source_updated_at,archived=EXCLUDED.archived,imported_at=now()
    WHERE coalesce(EXCLUDED.source_updated_at,'-infinity')>=coalesce(lavik_email.contacts.source_updated_at,'-infinity')`,
            [JSON.stringify(rows)],
          ),
          sql.query(
            `INSERT INTO lavik_email.suppressions(email,reason)
    SELECT email,'Source CRM opt-out or hard bounce' FROM jsonb_to_recordset($1::jsonb) AS r(email text,suppressed boolean)
    WHERE suppressed ON CONFLICT(email) DO NOTHING`,
            [JSON.stringify(rows)],
          ),
        ]);
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.log(
          JSON.stringify({
            retryBatch: true,
            attempt: attempt + 1,
            processed: lines,
          }),
        );
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    batch.clear();
  };
  for await (const line of createInterface({
    input: createReadStream("contacts.jsonl"),
    crlfDelay: Infinity,
  })) {
    digest.update(line + "\n");
    lines++;
    let c;
    try {
      c = normalizeContact(JSON.parse(line));
    } catch {
      malformed++;
      skipped++;
      continue;
    }
    if (!c) {
      skipped++;
      continue;
    }
    valid++;
    const old = batch.get(c.email);
    if (
      !old ||
      Date.parse(c.source_updated_at ?? "1970-01-01") >=
        Date.parse(old.source_updated_at ?? "1970-01-01")
    )
      batch.set(c.email, {
        ...c,
        suppressed: c.suppressed || !!old?.suppressed,
      });
    else if (c.suppressed) old.suppressed = true;
    if (batch.size >= 1500) await flush();
    if (lines % 30000 === 0)
      console.log(JSON.stringify({ processed: lines, valid, skipped }));
  }
  await flush();
  await sql`INSERT INTO lavik_email.imports(fingerprint,lines,valid,skipped) VALUES(${digest.digest("hex")},${lines},${valid},${skipped}) ON CONFLICT(fingerprint) DO UPDATE SET completed_at=now()`;
  const [counts] =
    await sql`SELECT (SELECT count(*)::int FROM lavik_email.contacts) AS unique_contacts,(SELECT count(*)::int FROM lavik_email.suppressions) AS suppressed`;
  console.log(
    JSON.stringify({
      complete: true,
      lines,
      valid,
      skipped,
      malformed,
      ...counts,
    }),
  );
}
run().catch((e) => {
  console.error(
    "Import stopped. Rerun safely; prior batches are idempotent. Error code:",
    e?.code ?? "unavailable",
  );
  process.exitCode = 1;
});
