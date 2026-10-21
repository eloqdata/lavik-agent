CREATE SCHEMA IF NOT EXISTS lavik_email;
CREATE TABLE IF NOT EXISTS lavik_email.settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false,
 postal_address text NOT NULL DEFAULT '', daily_limit integer NOT NULL DEFAULT 50 CHECK(daily_limit BETWEEN 1 AND 500),
 interval_seconds integer NOT NULL DEFAULT 120 CHECK(interval_seconds BETWEEN 60 AND 86400),
 next_send_at timestamptz NOT NULL DEFAULT now(), last_error text, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO lavik_email.settings(id) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS lavik_email.contacts (
 email text PRIMARY KEY, domain text NOT NULL, first_name text NOT NULL DEFAULT '', last_name text NOT NULL DEFAULT '',
 source_id text NOT NULL, source_updated_at timestamptz, archived boolean NOT NULL DEFAULT false,
 imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contacts_domain ON lavik_email.contacts(domain,email);
CREATE TABLE IF NOT EXISTS lavik_email.suppressions (
 email text PRIMARY KEY, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lavik_email.imports (
 fingerprint text PRIMARY KEY, lines bigint NOT NULL, valid bigint NOT NULL, skipped bigint NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lavik_email.jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, status text NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','running','paused','completed','blocked','cancelled')),
 content jsonb NOT NULL, audience jsonb NOT NULL, campaign text NOT NULL, path text NOT NULL,
 links jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, last_error text
);
CREATE TABLE IF NOT EXISTS lavik_email.recipients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES lavik_email.jobs(id),
 email text NOT NULL REFERENCES lavik_email.contacts(email), variant text NOT NULL CHECK(variant IN ('a','b')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','rejected','unknown','suppressed','replied','bounced')),
 token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, attempts integer NOT NULL DEFAULT 0,
 attempt_at timestamptz, accepted_at timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text, UNIQUE(job_id,email)
);
CREATE INDEX IF NOT EXISTS recipient_queue ON lavik_email.recipients(status,next_attempt_at,job_id);
CREATE INDEX IF NOT EXISTS recipient_history ON lavik_email.recipients(email,attempt_at);
CREATE INDEX IF NOT EXISTS recipient_rate ON lavik_email.recipients(attempt_at);
CREATE TABLE IF NOT EXISTS lavik_email.attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id uuid NOT NULL REFERENCES lavik_email.recipients(id),
 started_at timestamptz NOT NULL DEFAULT now(), outcome text NOT NULL DEFAULT 'sending'
);
CREATE INDEX IF NOT EXISTS attempts_rate ON lavik_email.attempts(started_at);

-- Row lock serializes all scheduled invocations across all jobs for this mailbox.
CREATE OR REPLACE FUNCTION lavik_email.claim() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE cfg lavik_email.settings; r lavik_email.recipients; j lavik_email.jobs; c lavik_email.contacts; attempt_id uuid;
BEGIN
 SELECT * INTO cfg FROM lavik_email.settings WHERE id=true FOR UPDATE;
 UPDATE lavik_email.recipients SET status='unknown',last_error='Interrupted send: verify Sent Items before any further action'
 WHERE status='sending' AND attempt_at < now()-interval '10 minutes';
 UPDATE lavik_email.jobs SET status='completed' WHERE status='running'
 AND NOT EXISTS(SELECT 1 FROM lavik_email.recipients WHERE job_id=lavik_email.jobs.id AND status IN ('pending','sending'));
 IF NOT cfg.enabled OR length(trim(cfg.postal_address))<10 OR cfg.next_send_at>now() THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM lavik_email.attempts WHERE started_at>now()-interval '24 hours')>=cfg.daily_limit THEN RETURN NULL; END IF;
 UPDATE lavik_email.recipients r0 SET status='suppressed',last_error='Suppressed, archived or contacted in the last 30 days'
 WHERE r0.status='pending' AND EXISTS(SELECT 1 FROM lavik_email.jobs WHERE id=r0.job_id AND status='running')
 AND (EXISTS(SELECT 1 FROM lavik_email.suppressions WHERE email=r0.email)
 OR EXISTS(SELECT 1 FROM lavik_email.contacts WHERE email=r0.email AND archived)
 OR EXISTS(SELECT 1 FROM lavik_email.recipients old WHERE old.email=r0.email AND old.id<>r0.id
 AND old.status IN ('sending','accepted','unknown','replied','bounced') AND old.attempt_at>now()-interval '30 days'));
 SELECT r1.* INTO r FROM lavik_email.recipients r1 JOIN lavik_email.jobs j1 ON j1.id=r1.job_id
 WHERE r1.status='pending' AND r1.next_attempt_at<=now() AND j1.status='running'
 ORDER BY r1.next_attempt_at,j1.created_at,r1.id LIMIT 1 FOR UPDATE OF r1,j1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO j FROM lavik_email.jobs WHERE id=r.job_id;
 SELECT * INTO c FROM lavik_email.contacts WHERE email=r.email;
 UPDATE lavik_email.recipients SET status='sending',attempts=attempts+1,attempt_at=now() WHERE id=r.id;
 INSERT INTO lavik_email.attempts(recipient_id) VALUES(r.id) RETURNING id INTO attempt_id;
 UPDATE lavik_email.settings SET next_send_at=now()+make_interval(secs=>cfg.interval_seconds),last_error=NULL WHERE id=true;
 RETURN jsonb_build_object('recipient',to_jsonb(r),'job',to_jsonb(j),'contact',to_jsonb(c),'address',cfg.postal_address,'attempt_id',attempt_id);
END $$;
ALTER TABLE lavik_email.jobs ADD COLUMN IF NOT EXISTS scheduled_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE lavik_email.jobs ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION lavik_email.start_job(target uuid, tracked_links jsonb, expected_revision integer) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE j lavik_email.jobs; n integer;
BEGIN
 SELECT * INTO j FROM lavik_email.jobs WHERE id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
 IF j.revision<>expected_revision THEN RAISE EXCEPTION 'Job changed; reload before starting'; END IF;
 IF j.status='paused' THEN UPDATE lavik_email.jobs SET status='running' WHERE id=target;RETURN 0; END IF;
 IF j.status<>'draft' THEN RAISE EXCEPTION 'Only a draft or paused job can start'; END IF;
 INSERT INTO lavik_email.recipients(job_id,email,variant,next_attempt_at)
 SELECT j.id,c.email,CASE WHEN j.content ? 'b' AND (row_number() OVER(ORDER BY md5(c.email||j.id::text)))%2=0 THEN 'b' ELSE 'a' END,j.scheduled_at
 FROM lavik_email.contacts c WHERE NOT c.archived
 AND (j.audience->>'domain'='' OR c.domain=j.audience->>'domain')
 AND (j.audience->>'search'='' OR concat_ws(' ',c.email,c.first_name,c.last_name) ILIKE '%'||(j.audience->>'search')||'%')
 AND NOT EXISTS(SELECT 1 FROM lavik_email.suppressions s WHERE s.email=c.email)
 AND NOT EXISTS(SELECT 1 FROM lavik_email.recipients old WHERE old.email=c.email AND old.status IN ('sending','accepted','unknown','replied','bounced') AND old.attempt_at>now()-interval '30 days')
 ORDER BY md5(c.email||j.id::text) LIMIT (j.audience->>'limit')::int;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n=0 THEN RAISE EXCEPTION 'No eligible recipients'; END IF;
 UPDATE lavik_email.jobs SET status='running',links=tracked_links,started_at=now() WHERE id=target;
 RETURN n;
END $$;
