import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
test(
  "email queue snapshots, suppression, concurrency and limits against PostgreSQL",
  { skip: process.env.CI !== "true" },
  async () => {
    const container = "lavik-email-ci-" + process.pid;
    execFileSync(
      "docker",
      [
        "run",
        "--detach",
        "--rm",
        "--name",
        container,
        "-e",
        "POSTGRES_DB=lavik_email_test",
        "-e",
        "POSTGRES_USER=lavik_test",
        "-e",
        "POSTGRES_PASSWORD=test-only-email",
        "postgres:16",
      ],
      { stdio: "pipe" },
    );
    try {
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          execFileSync(
            "docker",
            [
              "exec",
              container,
              "pg_isready",
              "-U",
              "lavik_test",
              "-d",
              "lavik_email_test",
            ],
            { stdio: "pipe" },
          );
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      assert.ok(ready, "Disposable PostgreSQL must be healthy");
      const args = [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "lavik_test",
        "-d",
        "lavik_email_test",
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
      ];
      const q = (sql: string) =>
        execFileSync("docker", args, {
          input: sql,
          encoding: "utf8",
          stdio: "pipe",
        }).trim();
      q("DROP SCHEMA IF EXISTS lavik_email CASCADE");
      q(readFileSync("packages/email/schema.sql", "utf8"));
      q(
        `INSERT INTO lavik_email.contacts(email,domain,source_id) SELECT 'person'||g||'@example.invalid','example.invalid',g::text FROM generate_series(1,20)g`,
      );
      q(
        `INSERT INTO lavik_email.suppressions(email,reason) VALUES('person1@example.invalid','unsubscribe')`,
      );
      const input = JSON.stringify({
        a: { subject: "A", body: "{{link}}" },
        b: { subject: "B", body: "{{link}}" },
      });
      const job = q(
        `INSERT INTO lavik_email.jobs(name,content,audience,campaign,path) VALUES('Test','${input}','{"domain":"example.invalid","search":"","limit":10}','landing','/en/') RETURNING id`,
      ).split("\n")[0];
      const links =
        '{"a":{"url":"https://lavik.dev/go/a"},"b":{"url":"https://lavik.dev/go/b"}}';
      assert.equal(
        q(`SELECT lavik_email.start_job('${job}','${links}',1)`),
        "10",
      );
      assert.equal(
        q(
          `SELECT count(*) FROM lavik_email.recipients WHERE email='person1@example.invalid'`,
        ),
        "0",
      );
      assert.equal(
        q(`SELECT count(*) FROM lavik_email.recipients WHERE variant='a'`),
        "5",
      );
      assert.equal(
        q(`SELECT count(*) FROM lavik_email.recipients WHERE variant='b'`),
        "5",
      );
      assert.throws(() =>
        q(`SELECT lavik_email.start_job('${job}','${links}',1)`),
      );
      assert.equal(q("SELECT lavik_email.claim()"), ""); // disabled by default
      q(
        `UPDATE lavik_email.settings SET enabled=true,postal_address='',daily_limit=2,interval_seconds=120`,
      );
      const run = promisify(execFile);
      const claims = await Promise.all(
        Array.from({ length: 8 }, () =>
          run("docker", [...args, "-c", "SELECT lavik_email.claim()"]),
        ),
      );
      const taken = claims.map((r) => r.stdout.trim()).filter(Boolean);
      assert.equal(taken.length, 1);
      const claimed = JSON.parse(taken[0]);
      assert.equal(q("SELECT count(*) FROM lavik_email.attempts"), "1");
      assert.equal(q("SELECT lavik_email.claim()"), "");
      q(
        `UPDATE lavik_email.recipients SET status='accepted' WHERE id='${claimed.recipient.id}';UPDATE lavik_email.settings SET next_send_at=now()-interval '1 second'`,
      );
      assert.ok(q("SELECT lavik_email.claim()"));
      q(
        `UPDATE lavik_email.settings SET next_send_at=now()-interval '1 second'`,
      );
      assert.equal(q("SELECT lavik_email.claim()"), ""); // rolling 24h cap
      q(
        `UPDATE lavik_email.recipients SET attempt_at=now()-interval '11 minutes' WHERE status='sending'`,
      );
      q("SELECT lavik_email.claim()");
      assert.equal(
        q("SELECT count(*) FROM lavik_email.recipients WHERE status='unknown'"),
        "1",
      );
      q(
        `UPDATE lavik_email.settings SET daily_limit=50; UPDATE lavik_email.jobs SET status='paused' WHERE id='${job}'`,
      );
      assert.equal(q("SELECT lavik_email.claim()"), "");
      q(`SELECT lavik_email.start_job('${job}','${links}',1)`);
      assert.equal(
        q(`SELECT count(*) FROM lavik_email.recipients WHERE job_id='${job}'`),
        "10",
      );
      q(
        `INSERT INTO lavik_email.suppressions(email,reason) SELECT email,'unsubscribe' FROM lavik_email.recipients WHERE status='pending' ON CONFLICT DO NOTHING`,
      );
      assert.equal(q("SELECT lavik_email.claim()"), "");
      assert.equal(
        q("SELECT count(*) FROM lavik_email.recipients WHERE status='pending'"),
        "0",
      );
      // A changed draft cannot start with links generated for a stale revision.
      const other = q(
        `INSERT INTO lavik_email.jobs(name,content,audience,campaign,path,revision) VALUES('Changed','${input}','{"domain":"example.invalid","search":"","limit":5}','landing','/en/',2) RETURNING id`,
      ).split("\n")[0];
      assert.throws(() =>
        q(`SELECT lavik_email.start_job('${other}','${links}',1)`),
      );
    } finally {
      execFileSync("docker", ["rm", "--force", container], { stdio: "pipe" });
    }
  },
);
