import {
  taskInputSchema,
  feedbackSchema,
  heartbeatSchema,
  updateSchema,
  terminal,
  roles,
  type Task,
  type TaskEvent,
  type RunnerStatus,
  type DispatchStatus,
  type Publication,
  publicationClaimSchema,
  publicationUpdateSchema,
  publicationReviewSchema,
  resultSchema,
} from "./contracts.ts";
import { artifactHash } from "./artifact-id.ts";

type Value = string | number | null;
export interface Database {
  sql: {
    exec<T extends Record<string, Value> = Record<string, Value>>(
      query: string,
      ...bindings: Value[]
    ): { toArray(): T[] };
  };
  transactionSync<T>(callback: () => T): T;
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const now = () => new Date().toISOString();

export class TaskStore {
  constructor(private db: Database) {
    db.sql
      .exec(`CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL, lease_token TEXT);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, task_id TEXT NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS task_events ON events(task_id, seq);
      CREATE TABLE IF NOT EXISTS runners (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dispatcher (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS worker_probe (id INTEGER PRIMARY KEY CHECK (id = 1));
      CREATE TABLE IF NOT EXISTS publications (task_id TEXT PRIMARY KEY, body TEXT NOT NULL, lease_token TEXT);
      CREATE INDEX IF NOT EXISTS task_status ON tasks(json_extract(body, '$.status'), created_at, id);
      CREATE INDEX IF NOT EXISTS runner_seen ON runners(json_extract(body, '$.lastSeenAt'));`);
  }
  dispatchStatus(): DispatchStatus {
    const row = this.db.sql
      .exec<{ body: string }>("SELECT body FROM dispatcher WHERE id = 1")
      .toArray()[0];
    return row
      ? JSON.parse(row.body)
      : {
          state: "idle",
          message: "Worker idle",
          attempts: 0,
        };
  }
  saveDispatch(status: DispatchStatus) {
    this.db.sql.exec(
      "INSERT INTO dispatcher (id,body) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      JSON.stringify(status),
    );
  }
  // Operational metadata only: briefs, drafts and feedback stay in the admin API.
  workStatus() {
    const tasks = this.db.sql
      .exec<{
        id: string;
        status: Task["status"];
        stage: string;
        leaseExpiresAt: string | null;
        runUrl: string | null;
      }>(
        "SELECT id, json_extract(body, '$.status') AS status, json_extract(body, '$.stage') AS stage, json_extract(body, '$.leaseExpiresAt') AS leaseExpiresAt, json_extract(body, '$.runUrl') AS runUrl FROM tasks ORDER BY created_at DESC, rowid DESC LIMIT 100",
      )
      .toArray();
    const queued = this.db.sql
      .exec<{ total: number }>(
        "SELECT COUNT(*) AS total FROM tasks WHERE json_extract(body, '$.status') = 'queued'",
      )
      .toArray()[0].total;
    const running = this.list("running", true)[0];
    return {
      queued,
      publications: this.publications().filter((p) =>
        ["queued", "publishing", "deploying"].includes(p.status),
      ).length,
      probe:
        this.db.sql.exec("SELECT id FROM worker_probe WHERE id = 1").toArray()
          .length > 0,
      running: running
        ? {
            id: running.id,
            stage: running.stage,
            leaseExpiresAt: running.leaseExpiresAt,
            runUrl: running.runUrl,
          }
        : null,
      tasks,
      dispatch: this.dispatchStatus(),
    };
  }
  refreshLeases() {
    this.db.transactionSync(() => {
      this.expireLeases();
      this.expirePublications();
    });
  }
  private publications(): Publication[] {
    return this.db.sql
      .exec<{ body: string }>(
        "SELECT body FROM publications ORDER BY rowid ASC",
      )
      .toArray()
      .map((r) => JSON.parse(r.body));
  }
  private savePublication(task: Task, publication: Publication) {
    publication.updatedAt = now();
    task.publication = publication;
    this.db.sql.exec(
      "INSERT INTO publications(task_id,body) VALUES (?,?) ON CONFLICT(task_id) DO UPDATE SET body=excluded.body",
      task.id,
      JSON.stringify(publication),
    );
    this.save(task);
  }
  private enqueuePublication(task: Task, digest: string) {
    if (task.publication) return;
    this.savePublication(task, {
      taskId: task.id,
      artifactHash: digest,
      status: "queued",
      attempts: 0,
      createdAt: now(),
      updatedAt: now(),
    });
    this.addEvent(
      task.id,
      "publication-queued",
      "Review passed; website publication queued",
      "publisher",
    );
  }
  private expirePublications() {
    for (const publication of this.publications()) {
      if (
        !["publishing", "deploying"].includes(publication.status) ||
        !publication.leaseExpiresAt ||
        publication.leaseExpiresAt >= now()
      )
        continue;
      const task = this.get(publication.taskId);
      publication.status = publication.attempts < 3 ? "queued" : "failed";
      publication.error =
        "Publisher heartbeat expired. Deployment will be reconciled before retrying.";
      publication.nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
      task.status =
        publication.status === "queued" ? "approved" : "publication_failed";
      task.stage =
        publication.status === "queued"
          ? "Publication retry scheduled"
          : "Publication needs attention";
      this.savePublication(task, publication);
      this.addEvent(
        task.id,
        "publication-interrupted",
        publication.error,
        "publisher",
      );
    }
  }
  private get(id: string): Task {
    const row = this.db.sql
      .exec<{ body: string }>("SELECT body FROM tasks WHERE id = ?", id)
      .toArray()[0];
    if (!row) throw new HttpError(404, "Task not found");
    return JSON.parse(row.body);
  }
  private save(task: Task) {
    task.updatedAt = now();
    this.db.sql.exec(
      "UPDATE tasks SET body = ? WHERE id = ?",
      JSON.stringify(task),
      task.id,
    );
  }
  private addEvent(
    taskId: string,
    type: string,
    message: string,
    actor: string,
    data?: Record<string, unknown>,
    id = crypto.randomUUID(),
  ) {
    const event: TaskEvent = {
      id,
      taskId,
      at: now(),
      type,
      message,
      actor,
      ...(data ? { data } : {}),
    };
    this.db.sql.exec(
      "INSERT INTO events (id,task_id,body) VALUES (?,?,?)",
      id,
      taskId,
      JSON.stringify(event),
    );
  }
  private list(status: string, oldestOnly = false): Task[] {
    return this.db.sql
      .exec<{ body: string }>(
        `SELECT body FROM tasks WHERE json_extract(body, '$.status') = ? ORDER BY created_at ASC, rowid ASC${oldestOnly ? " LIMIT 1" : ""}`,
        status,
      )
      .toArray()
      .map((row) => JSON.parse(row.body));
  }
  private expireLeases() {
    for (const task of this.list("running"))
      if (task.status === "running" && task.leaseExpiresAt! < now()) {
        task.status = "failed";
        task.stage = "Worker disconnected";
        task.finishedAt = now();
        task.error =
          "The worker heartbeat expired. Inspect the saved work before retrying.";
        this.save(task);
        this.addEvent(task.id, "worker-lost", task.error, "system");
      }
  }
  private create(
    input: ReturnType<typeof taskInputSchema.parse>,
    actor: string,
    parentId?: string,
  ) {
    const existing = this.db.sql
      .exec<{ id: string }>(
        "SELECT id FROM tasks WHERE request_key = ?",
        input.requestId,
      )
      .toArray()[0];
    if (existing) {
      const task = this.get(existing.id);
      if (
        task.role !== input.role ||
        task.title !== input.title ||
        task.brief !== input.brief ||
        task.articleId !== input.articleId ||
        task.parentId !== parentId
      )
        throw new HttpError(
          409,
          "Request identity was already used for different inputs",
        );
      return task;
    }
    if (
      this.db.sql
        .exec<{ total: number }>(
          "SELECT COUNT(*) AS total FROM tasks WHERE json_extract(body, '$.status') = 'queued'",
        )
        .toArray()[0].total >= 100
    )
      throw new HttpError(
        409,
        "Queue limit reached; finish or cancel existing tasks first",
      );
    const role = roles.find((r) => r.id === input.role)!;
    if (role.work === "reviewer" && !input.articleId && !parentId)
      throw new HttpError(
        400,
        "Select an article or a previous task to review",
      );
    const task: Task = {
      ...input,
      id: crypto.randomUUID(),
      ...(parentId ? { parentId } : {}),
      status: "queued",
      stage: "Waiting for worker",
      createdAt: now(),
      updatedAt: now(),
      createdBy: actor,
    };
    this.db.sql.exec(
      "INSERT INTO tasks (id,request_key,created_at,body) VALUES (?,?,?,?)",
      task.id,
      task.requestId,
      task.createdAt,
      JSON.stringify(task),
    );
    this.addEvent(
      task.id,
      "created",
      parentId
        ? "Revision queued with previous work and owner feedback"
        : "Task queued",
      actor,
    );
    return task;
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const body = request.method === "GET" ? undefined : await request.json();
      const digest =
        body?.stage === "complete" && body.result
          ? await artifactHash(resultSchema.parse(body.result))
          : undefined;
      // Existing reviewed tasks are recovered after upgrading to the publisher.
      if (request.headers.get("X-Publisher-Authorized") === "true") {
        for (const snapshot of this.list("approved")) {
          if (snapshot.publication || !snapshot.result) continue;
          const hash = await artifactHash(snapshot.result);
          this.db.transactionSync(() => {
            const task = this.get(snapshot.id);
            if (task.status === "approved") this.enqueuePublication(task, hash);
          });
        }
      }
      return this.db.transactionSync(() => this.route(request, body, digest));
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      if (error instanceof Error && error.name === "ZodError")
        return json({ error: "Invalid request fields" }, 400);
      console.error(
        "Admin storage request failed",
        error instanceof Error ? error.name : "unknown",
      );
      return json({ error: "Unable to process this request" }, 500);
    }
  }
  private route(request: Request, body: unknown, digest?: string): Response {
    this.expireLeases();
    this.expirePublications();
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    const actor = request.headers.get("X-Admin-Actor") ?? "runner";
    const runner = request.headers.get("X-Runner-Authorized") === "true";
    const publisher = request.headers.get("X-Publisher-Authorized") === "true";
    if (path === "/api/admin/dashboard" && request.method === "GET") {
      const counts = {
        queued: 0,
        running: 0,
        approved: 0,
        needs_revision: 0,
        failed: 0,
        cancelled: 0,
        publishing: 0,
        deploying: 0,
        published: 0,
        publication_failed: 0,
      };
      for (const row of this.db.sql
        .exec<{ status: keyof typeof counts; total: number }>(
          "SELECT json_extract(body, '$.status') AS status, COUNT(*) AS total FROM tasks GROUP BY json_extract(body, '$.status')",
        )
        .toArray())
        counts[row.status] = row.total;
      const summaries = this.db.sql
        .exec<{ body: string }>(
          "SELECT json_remove(body, '$.result', '$.brief') AS body FROM tasks ORDER BY created_at DESC, id DESC LIMIT 100",
        )
        .toArray()
        .map((row) => JSON.parse(row.body));
      const runners = this.db.sql
        .exec<{ body: string }>(
          "SELECT body FROM runners ORDER BY json_extract(body, '$.lastSeenAt') DESC LIMIT 10",
        )
        .toArray()
        .map((row) => JSON.parse(row.body) as RunnerStatus);
      return json({
        tasks: summaries,
        counts,
        runners,
        email: actor,
        dispatch: this.dispatchStatus(),
      });
    }
    if (path === "/api/runner/status" && request.method === "GET" && runner)
      return json(this.workStatus());
    // An authenticated operations probe exercises alarm -> GitHub -> heartbeat.
    // With an empty task queue the workflow skips Docker and model calls.
    if (path === "/api/runner/wake" && request.method === "POST" && runner) {
      if (!body || typeof body !== "object" || Object.keys(body).length)
        throw new HttpError(400, "Expected an empty JSON object");
      this.db.sql.exec("INSERT OR IGNORE INTO worker_probe (id) VALUES (1)");
      return json({ scheduled: true }, 202);
    }
    if (path === "/api/admin/tasks" && request.method === "POST")
      return json(this.create(taskInputSchema.parse(body), actor), 201);
    const taskPath = path.match(
      /^\/api\/admin\/tasks\/([a-f0-9-]{36})(?:\/(feedback|cancel|export|retry-publication))?$/,
    );
    if (taskPath) {
      const task = this.get(taskPath[1]),
        action = taskPath[2];
      if (request.method === "GET" && (!action || action === "export")) {
        const events = this.db.sql
          .exec<{ body: string }>(
            `SELECT body FROM events WHERE task_id = ? ORDER BY seq DESC${action === "export" ? "" : " LIMIT 200"}`,
            task.id,
          )
          .toArray()
          .map((r) => JSON.parse(r.body))
          .reverse();
        return json({ task, events });
      }
      if (request.method === "POST" && action === "cancel") {
        if (["publishing", "deploying"].includes(task.status))
          throw new HttpError(
            409,
            "Publication is in progress; wait for its deployment result before revising.",
          );
        if (task.publication?.status === "queued") {
          task.status = "cancelled";
          task.stage = "Publication cancelled by owner";
          this.savePublication(task, {
            ...task.publication,
            status: "cancelled",
          });
          this.addEvent(task.id, "publication-cancelled", task.stage, actor);
        }
        if (!terminal(task.status)) {
          task.status = "cancelled";
          task.stage = "Cancelled by owner";
          task.finishedAt = now();
          this.save(task);
          this.addEvent(task.id, "cancelled", task.stage, actor);
        }
        return json(task);
      }
      if (request.method === "POST" && action === "retry-publication") {
        if (task.publication?.status !== "failed") return json(task);
        task.status = "approved";
        task.stage = "Publication retry queued";
        this.savePublication(task, {
          ...task.publication,
          status: "queued",
          attempts: 0,
          nextAttemptAt: undefined,
        });
        this.addEvent(task.id, "publication-retry", task.stage, actor);
        return json(task);
      }
      if (request.method === "POST" && action === "feedback") {
        const input = feedbackSchema.parse(body);
        const existing = this.db.sql
          .exec<{ body: string }>(
            "SELECT body FROM events WHERE id = ?",
            input.requestId,
          )
          .toArray()[0];
        if (existing) {
          const event = JSON.parse(existing.body) as TaskEvent;
          if (
            event.taskId !== task.id ||
            event.message !== input.message ||
            event.data?.action !== input.action
          )
            throw new HttpError(409, "Feedback identity conflict");
          return json({
            task:
              typeof event.data?.nextTaskId === "string"
                ? this.get(event.data.nextTaskId)
                : task,
            event,
          });
        }
        if (input.action !== "comment" && !terminal(task.status))
          throw new HttpError(
            409,
            "Finish or cancel this task before starting a revision",
          );
        if (input.action === "revise" && !task.result?.editions.length)
          throw new HttpError(
            409,
            "This task has no saved draft to revise; retry it instead",
          );
        let next: Task | undefined;
        if (input.action !== "comment") {
          if (task.publication?.status === "queued") {
            task.status = "cancelled";
            task.stage = "Publication replaced by a revision";
            this.savePublication(task, {
              ...task.publication,
              status: "cancelled",
            });
          }
          const role =
            input.action === "revise"
              ? roles.find((r) => r.id === task.role)!.kind === "docs"
                ? "manual-writer"
                : "blog-writer"
              : task.role;
          next = this.create(
            {
              requestId: input.requestId,
              role,
              title: task.title,
              brief: task.brief,
              articleId:
                task.articleId ??
                (task.publication?.status === "published"
                  ? task.result?.editions[0].article.id
                  : undefined),
            },
            actor,
            task.id,
          );
        }
        this.addEvent(
          task.id,
          "feedback",
          input.message,
          actor,
          { action: input.action, ...(next ? { nextTaskId: next.id } : {}) },
          input.requestId,
        );
        return json({ task: next ?? task });
      }
    }
    if (
      ["/api/runner/claim", "/api/runner/check"].includes(path) &&
      request.method === "POST" &&
      runner
    ) {
      const input = heartbeatSchema.parse(body);
      this.db.sql.exec("DELETE FROM worker_probe");
      const status = { ...input, lastSeenAt: now() };
      this.db.sql.exec(
        "INSERT INTO runners(id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        input.runnerId,
        JSON.stringify({ ...status, id: input.runnerId }),
      );
      this.db.sql.exec(
        "DELETE FROM runners WHERE json_extract(body, '$.lastSeenAt') < ?",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      );
      if (path === "/api/runner/check")
        return json({
          ready:
            !this.list("running", true).length &&
            !this.publications().some((p) =>
              ["queued", "publishing", "deploying"].includes(p.status),
            ) &&
            Boolean(this.list("queued", true).length),
        });
      if (this.list("running", true).length) return json({ task: null });
      const task = this.list("queued", true)[0];
      if (!task) return json({ task: null });
      task.status = "running";
      task.stage = "Starting";
      task.activeRole = task.role;
      task.startedAt = now();
      task.runnerId = input.runnerId;
      task.runUrl = input.runUrl;
      task.leaseExpiresAt = new Date(Date.now() + 120000).toISOString();
      const leaseToken = crypto.randomUUID();
      this.db.sql.exec(
        "UPDATE tasks SET lease_token = ? WHERE id = ?",
        leaseToken,
        task.id,
      );
      this.save(task);
      this.addEvent(
        task.id,
        "started",
        `Assigned to ${input.runnerId}`,
        "runner",
      );
      const parent = task.parentId ? this.get(task.parentId) : undefined;
      const lineage = [task.id];
      let ancestor = parent;
      while (ancestor) {
        lineage.unshift(ancestor.id);
        ancestor = ancestor.parentId ? this.get(ancestor.parentId) : undefined;
      }
      const feedback = lineage.flatMap((id) =>
        this.db.sql
          .exec<{ body: string }>(
            "SELECT body FROM events WHERE task_id = ? AND json_extract(body, '$.type') = 'feedback' ORDER BY seq",
            id,
          )
          .toArray()
          .map((row) => (JSON.parse(row.body) as TaskEvent).message),
      );
      return json({ task, leaseToken, previous: parent?.result, feedback });
    }
    const updatePath = path.match(/^\/api\/runner\/tasks\/([a-f0-9-]{36})$/);
    if (updatePath && request.method === "POST" && runner) {
      const input = updateSchema.parse(body),
        task = this.get(updatePath[1]);
      const lease = this.db.sql
        .exec<{ lease_token: string }>(
          "SELECT lease_token FROM tasks WHERE id = ?",
          task.id,
        )
        .toArray()[0];
      if (task.status !== "running" || lease.lease_token !== input.leaseToken)
        throw new HttpError(409, "Task lease is no longer active");
      task.leaseExpiresAt = new Date(Date.now() + 120000).toISOString();
      task.stage = input.stage;
      task.activeRole = input.activeRole ?? task.activeRole;
      if (input.result) task.result = input.result;
      if (input.error) {
        task.status = "failed";
        task.error = input.error;
        task.finishedAt = now();
      } else if (input.stage === "complete") {
        if (!task.result || task.result.editions.length !== 2)
          throw new HttpError(400, "Both language editions are required");
        if (
          new Set(task.result.editions.map((e) => e.article.locale)).size !==
            2 ||
          task.result.editions.some(
            (e) =>
              e.article.kind !== roles.find((r) => r.id === task.role)!.kind,
          )
        )
          throw new HttpError(
            400,
            "Result does not match this task's languages and article kind",
          );
        task.status = task.result.editions.every(
          (e) =>
            e.review.verdict === "pass" &&
            !e.review.findings.length &&
            e.receipts.every((r) => r.status === "passed"),
        )
          ? "approved"
          : "needs_revision";
        task.stage =
          task.status === "approved"
            ? "Independent review passed"
            : "Changes requested";
        task.finishedAt = now();
        if (task.status === "approved") {
          if (!digest)
            throw new HttpError(
              400,
              "Completing review requires the full reviewed result",
            );
          this.enqueuePublication(task, digest);
        }
      }
      this.save(task);
      if (input.event)
        this.addEvent(
          task.id,
          input.event.type,
          input.event.message,
          "runner",
          input.event.data,
        );
      if (terminal(task.status))
        this.addEvent(task.id, task.status, task.error ?? task.stage, "runner");
      if (task.runnerId) {
        const row = this.db.sql
          .exec<{ body: string }>(
            "SELECT body FROM runners WHERE id = ?",
            task.runnerId,
          )
          .toArray()[0];
        if (row)
          this.db.sql.exec(
            "UPDATE runners SET body = ? WHERE id = ?",
            JSON.stringify({ ...JSON.parse(row.body), lastSeenAt: now() }),
            task.runnerId,
          );
      }
      return json({ status: task.status });
    }
    if (
      path === "/api/publisher/review" &&
      request.method === "POST" &&
      publisher
    ) {
      const input = publicationReviewSchema.parse(body);
      const row = this.db.sql
        .exec<{ body: string }>(
          "SELECT body FROM runners ORDER BY json_extract(body, '$.lastSeenAt') DESC LIMIT 1",
        )
        .toArray()[0];
      const article =
        row &&
        (JSON.parse(row.body) as RunnerStatus).catalog.find(
          (a) => a.id === input.articleId,
        );
      if (!article)
        throw new HttpError(
          400,
          "Select an existing article from the worker catalog for publication review.",
        );
      return json(
        this.create(
          taskInputSchema.parse({
            requestId: input.requestId,
            articleId: article.id,
            role: article.kind === "docs" ? "manual-reviewer" : "blog-reviewer",
            title: "Website publication review",
            brief:
              "Independently review this existing website article against the current pinned sources, claims, audited command results, rendering and publication policy. Preserve the article. Report any factual, scope, or execution issues; publish only if both language editions pass all checks.",
          }),
          "publisher",
        ),
        201,
      );
    }
    if (
      path === "/api/publisher/claim" &&
      request.method === "POST" &&
      publisher
    ) {
      const input = publicationClaimSchema.parse(body);
      const active = this.publications().find((p) =>
        ["publishing", "deploying"].includes(p.status),
      );
      const publication =
        active ??
        this.publications().find(
          (p) =>
            p.status === "queued" &&
            (!p.nextAttemptAt || p.nextAttemptAt <= now()),
        );
      if (!publication || (active && active.runUrl !== input.runUrl))
        return json({ task: null });
      const task = this.get(publication.taskId);
      let leaseToken = this.db.sql
        .exec<{ lease_token: string | null }>(
          "SELECT lease_token FROM publications WHERE task_id=?",
          task.id,
        )
        .toArray()[0].lease_token;
      if (!active) {
        publication.status = "publishing";
        publication.attempts++;
        publication.runUrl = input.runUrl;
        leaseToken = crypto.randomUUID();
        this.db.sql.exec(
          "UPDATE publications SET lease_token=? WHERE task_id=?",
          leaseToken,
          task.id,
        );
        task.status = "publishing";
        task.stage = "Validating reviewed article and publication evidence";
        this.addEvent(task.id, "publishing", task.stage, "publisher");
      }
      publication.leaseExpiresAt = new Date(Date.now() + 120_000).toISOString();
      this.savePublication(task, publication);
      return json({
        task: {
          id: task.id,
          role: task.role,
          articleId: task.articleId,
          result: task.result,
        },
        publication,
        leaseToken,
      });
    }
    const publicationPath = path.match(
      /^\/api\/publisher\/tasks\/([a-f0-9-]{36})$/,
    );
    if (publicationPath && request.method === "POST" && publisher) {
      const input = publicationUpdateSchema.parse(body),
        task = this.get(publicationPath[1]);
      const publication = task.publication;
      const row = this.db.sql
        .exec<{ lease_token: string | null }>(
          "SELECT lease_token FROM publications WHERE task_id=?",
          task.id,
        )
        .toArray()[0];
      if (
        !publication ||
        row?.lease_token !== input.leaseToken ||
        publication.artifactHash !== input.artifactHash
      )
        throw new HttpError(409, "Publication lease or artifact changed");
      if (
        publication.status === "published" &&
        input.stage === "published" &&
        input.commit === publication.commit &&
        input.deploymentId === publication.deploymentId
      )
        return json({ status: task.status });
      if (!["publishing", "deploying"].includes(publication.status))
        throw new HttpError(409, "Publication lease is no longer active");
      publication.leaseExpiresAt = new Date(Date.now() + 120_000).toISOString();
      if (input.stage === "deploying") {
        if (!input.commit)
          throw new HttpError(400, "Deployment requires the content commit");
        publication.commit = input.commit;
        publication.status = "deploying";
        task.status = "deploying";
        task.stage = "Deploying to Cloudflare and checking live pages";
      }
      if (input.stage === "published") {
        if (
          publication.status !== "deploying" ||
          !input.commit ||
          input.commit !== publication.commit ||
          !input.deploymentId
        )
          throw new HttpError(
            400,
            "A verified deployment of the content commit is required",
          );
        publication.status = "published";
        publication.deploymentId = input.deploymentId;
        publication.publishedAt = now();
        publication.error = undefined;
        publication.urls = Object.fromEntries(
          task.result!.editions.map(({ article }) => [
            article.locale,
            `https://lavik.dev/${article.locale}/${article.kind === "docs" ? `docs/${article.version}` : "blog"}/${article.slug}/`,
          ]),
        ) as Publication["urls"];
        task.status = "published";
        task.stage = "Published on lavik.dev";
      }
      if (input.stage === "failed") {
        publication.error =
          input.error ?? "Publication failed; inspect the publisher run.";
        publication.status =
          input.retryable && publication.attempts < 3 ? "queued" : "failed";
        publication.nextAttemptAt = new Date(
          Date.now() + 60_000 * publication.attempts,
        ).toISOString();
        task.status =
          publication.status === "queued" ? "approved" : "publication_failed";
        task.stage =
          publication.status === "queued"
            ? "Publication retry scheduled"
            : "Publication needs attention";
      }
      this.savePublication(task, publication);
      if (input.stage !== "heartbeat")
        this.addEvent(
          task.id,
          `publication-${input.stage}`,
          publication.error ?? task.stage,
          "publisher",
        );
      return json({ status: task.status });
    }
    throw new HttpError(404, "Endpoint not found");
  }
}
