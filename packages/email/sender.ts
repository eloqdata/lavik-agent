import { database } from "./database";
import {
  configured,
  emailOrigin,
  renderMessage,
  type EmailEnv,
  type JobInput,
} from "./model";
import { outlookToken, sendOutlook } from "./outlook";
type Claim = {
  recipient: {
    id: string;
    email: string;
    variant: "a" | "b";
    token: string;
    attempts: number;
  };
  job: {
    id: string;
    content: JobInput["content"];
    links: Record<string, { url: string }>;
  };
  contact: { first_name: string; last_name: string };
  address: string;
  attempt_id: string;
};
export async function tickEmail(env: EmailEnv) {
  if (!env.EMAIL_DATABASE_URL || !configured(env)) return;
  const sql = database(env);
  await sql`UPDATE lavik_email.recipients SET status='unknown',last_error='Interrupted send: verify Sent Items before any further action' WHERE status='sending' AND attempt_at<now()-interval '10 minutes'`;
  await sql`UPDATE lavik_email.jobs SET status='completed' WHERE status='running' AND NOT EXISTS(SELECT 1 FROM lavik_email.recipients WHERE job_id=lavik_email.jobs.id AND status IN ('pending','sending'))`;
  const [settings] =
    await sql`SELECT enabled,next_send_at<=now() AS ready FROM lavik_email.settings WHERE id=true`;
  if (!settings?.enabled || !settings.ready || !configured(env)) return;
  let token: string;
  try {
    token = await outlookToken(env);
  } catch {
    await sql`UPDATE lavik_email.settings SET enabled=false,last_error='Outlook authentication failed. Check connection settings and re-enable sending.' WHERE id=true`;
    return;
  }
  const [row] = await sql`SELECT lavik_email.claim() AS claim`;
  const claim = row.claim as Claim | null;
  if (!claim) return;
  const { recipient: r, job: j } = claim;
  const template = j.content[r.variant],
    link = j.links[r.variant]?.url;
  if (!template || !link) {
    await sql`UPDATE lavik_email.recipients SET status='rejected',last_error='Missing frozen template or link' WHERE id=${r.id}::uuid`;
    return;
  }
  const unsubscribe = `${emailOrigin}/email/unsubscribe/${r.token}`;
  const message = renderMessage(
    template,
    claim.contact,
    link,
    unsubscribe,
    claim.address,
  );
  const result = await sendOutlook(token, {
    id: r.id,
    to: r.email,
    ...message,
    unsubscribe,
  });
  // One durable outcome transaction. A crash leaves 'sending', which becomes 'unknown', never an automatic retry.
  const status =
    result.status === "throttled"
      ? r.attempts >= 4
        ? "rejected"
        : "pending"
      : result.status === "blocked"
        ? "rejected"
        : result.status;
  const reason =
    "code" in result
      ? result.code
      : result.status === "throttled"
        ? "Outlook throttled; waiting for Retry-After"
        : null;
  const statements = [
    sql.query(
      `UPDATE lavik_email.recipients SET status=$2,last_error=$3,accepted_at=CASE WHEN $2='accepted' THEN now() ELSE accepted_at END,next_attempt_at=$4 WHERE id=$1::uuid AND status IN ('sending','unknown')`,
      [
        r.id,
        status,
        reason,
        result.status === "throttled"
          ? result.retry.toISOString()
          : new Date().toISOString(),
      ],
    ),
    sql.query("UPDATE lavik_email.attempts SET outcome=$2 WHERE id=$1::uuid", [
      claim.attempt_id,
      result.status,
    ]),
  ];
  if (result.status === "throttled")
    statements.push(
      sql.query(
        "UPDATE lavik_email.settings SET next_send_at=greatest(next_send_at,$1::timestamptz),last_error=$2 WHERE id=true",
        [result.retry.toISOString(), reason],
      ),
    );
  if (result.status === "blocked")
    statements.push(
      sql.query(
        "UPDATE lavik_email.settings SET enabled=false,last_error=$1 WHERE id=true",
        [reason],
      ),
    );
  await sql.transaction(statements);
}
