"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  roles,
  channels,
  terminal,
  type Dashboard,
  type TaskDetail,
  type Task,
  type Role,
  type TaskResult,
} from "../../../packages/admin/contracts";

const labels: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  approved: "Review passed",
  needs_revision: "Changes requested",
  failed: "Failed",
  cancelled: "Cancelled",
};
const when = (date?: string) => (date ? new Date(date).toLocaleString() : "—");
const pendingMutations = new Map<string, string>();
async function request<T>(path: string, body?: unknown): Promise<T> {
  // A server may commit before its response is lost. Preserve the request identity
  // when the owner retries unchanged inputs, including feedback that queues a revision.
  const identified =
    body && typeof body === "object" && "requestId" in body
      ? (body as Record<string, unknown>)
      : undefined;
  const retryKey = identified
    ? `${path}:${JSON.stringify({ ...identified, requestId: undefined })}`
    : undefined;
  if (identified && retryKey) {
    const requestId =
      pendingMutations.get(retryKey) ?? String(identified.requestId);
    pendingMutations.set(retryKey, requestId);
    body = { ...identified, requestId };
  }
  const response = await fetch(`/api/admin/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({
      error: "Sign-in expired or the service is unavailable",
    }));
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  const result = await response.json();
  if (retryKey) pendingMutations.delete(retryKey);
  return result;
}
function Preview({
  edition,
  references,
}: {
  edition: TaskResult["editions"][number];
  references?: TaskResult["references"];
}) {
  return (
    <article className="draft-preview">
      <h3>{edition.article.title}</h3>
      <p className="draft-summary">{edition.article.summary}</p>
      {edition.article.blocks.map((block, index) => {
        if (block.type === "heading") return <h4 key={index}>{block.text}</h4>;
        if (block.type === "paragraph")
          return (
            <div key={index}>
              <p>{block.text}</p>
              <small className="sources">
                Sources:{" "}
                {block.sources.map((id, i) => (
                  <span key={id}>
                    {i > 0 ? ", " : ""}
                    {references?.sources[id] ? (
                      <a
                        href={references.sources[id]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {id} ↗
                      </a>
                    ) : (
                      id
                    )}
                  </span>
                ))}
              </small>
            </div>
          );
        if (block.type === "recipe") {
          const receipt = edition.receipts.find(
            (r) => r.recipeId === block.recipeId,
          );
          return (
            <details key={index} className="evidence">
              <summary>
                Command evidence · {block.recipeId} ·{" "}
                {receipt?.status ?? "missing"}
              </summary>
              <p>
                {receipt?.platform} · {receipt?.release}
              </p>
              <pre>{receipt?.output ?? "No execution record"}</pre>
            </details>
          );
        }
        if (block.type === "calculation")
          return (
            <p className="block-reference" key={index}>
              Capacity economics calculator ·{" "}
              <a
                href={`/${edition.article.locale}/cost/`}
                target="_blank"
                rel="noreferrer"
              >
                Inspect the formula and assumptions ↗
              </a>
            </p>
          );
        return (
          <p className="block-reference" key={index}>
            {references?.claims[block.claimId]?.[edition.article.locale] ?? (
              <>
                Registered claim: <code>{block.claimId}</code>
              </>
            )}
          </p>
        );
      })}
      <div className="review-box">
        <strong>Independent review: {edition.review.verdict}</strong>
        {edition.review.findings.length ? (
          <ul>
            {edition.review.findings.map((finding, i) => (
              <li key={i}>{finding}</li>
            ))}
          </ul>
        ) : (
          <p>No outstanding findings.</p>
        )}
        <small>
          Inspected sources:{" "}
          {edition.review.checkedSourceIds.join(", ") || "None yet"}
        </small>
      </div>
    </article>
  );
}
export function AdminConsole() {
  const [data, setData] = useState<Dashboard>();
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<TaskDetail>();
  const [tab, setTab] = useState<"tasks" | "channels">("tasks");
  const [role, setRole] = useState<Role>("blog-writer");
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [locale, setLocale] = useState("en");
  const formRef = useRef<HTMLFormElement>(null);
  const detailRequest = useRef(0);
  const load = useCallback(async () => {
    try {
      const snapshot = await request<Dashboard>("dashboard");
      setData(snapshot);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const loadDetail = useCallback(async () => {
    if (!selected) return;
    const generation = ++detailRequest.current;
    try {
      const next = await request<TaskDetail>(`tasks/${selected}`);
      if (generation === detailRequest.current) setDetail(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [selected]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    setDetail(undefined);
    setFeedback("");
    void loadDetail();
    const timer = setInterval(() => void loadDetail(), 5000);
    return () => {
      clearInterval(timer);
      detailRequest.current++;
    };
  }, [loadDetail]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    try {
      const task = await request<Task>("tasks", {
        requestId: crypto.randomUUID(),
        role,
        title: form.get("title"),
        brief: form.get("brief"),
        ...(form.get("articleId") ? { articleId: form.get("articleId") } : {}),
      });
      setSelected(task.id);
      setShowForm(false);
      setNotice(
        "Task queued. You can close this page; the worker will keep its progress.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "comment" | "revise" | "retry" | "cancel") {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    try {
      if (action === "cancel") await request(`tasks/${selected}/cancel`, {});
      else {
        const result = await request<{ task: Task }>(
          `tasks/${selected}/feedback`,
          {
            requestId: crypto.randomUUID(),
            message:
              feedback.trim() ||
              (action === "retry"
                ? "Retry after inspecting the previous failure."
                : ""),
            action,
          },
        );
        if (result.task.id !== selected) setSelected(result.task.id);
        setFeedback("");
      }
      setNotice(
        action === "comment"
          ? "Feedback saved. It will be included when you request a revision."
          : action === "cancel"
            ? "Task cancelled. The worker will stop at its next cancellation check."
            : "A new attempt is queued; the previous work remains in history.",
      );
      await load();
      await loadDetail();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const chosenRole = roles.find((r) => r.id === role)!;
  const catalog =
    data?.runners[0]?.catalog.filter((a) => a.kind === chosenRole.kind) ?? [];
  const visible =
    data?.tasks.filter((t) => filter === "all" || t.status === filter) ?? [];
  const edition = detail?.task.result?.editions.find(
    (e) => e.article.locale === locale,
  );
  const recentRunner = data?.runners.find(
    (r) => Date.now() - Date.parse(r.lastSeenAt) < 120000,
  );
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-logo" href="/en/">
          ▰ lavik <span>OPERATIONS</span>
        </a>
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Admin navigation">
          <button
            className={tab === "tasks" ? "active" : ""}
            onClick={() => setTab("tasks")}
          >
            ◫ &nbsp; Agent team
          </button>
          <button
            className={tab === "channels" ? "active" : ""}
            onClick={() => setTab("channels")}
          >
            ↗ &nbsp; Publishing
          </button>
        </nav>
        <div className="sidebar-bottom">
          <span className="private-label">Private workspace</span>
          <p>
            Accuracy first.
            <br />
            Every task leaves evidence.
          </p>
          <a href="/en/" target="_blank" rel="noreferrer">
            Open lavik.dev ↗
          </a>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <span>
            Lavik Agent <b>/</b> {tab === "tasks" ? "Agent team" : "Publishing"}
          </span>
          <span>
            {data?.email ?? "Checking sign-in…"}{" "}
            <a href="/cdn-cgi/access/logout">Sign out</a>
          </span>
        </header>
        {error && (
          <div className="admin-alert" role="alert">
            {error}{" "}
            <button
              onClick={() => {
                void load();
                void loadDetail();
              }}
            >
              Retry connection
            </button>
          </div>
        )}
        {notice && (
          <div className="admin-notice" role="status">
            {notice}
          </div>
        )}
        {tab === "channels" ? (
          <section className="admin-content">
            <p className="admin-eyebrow">DISTRIBUTION</p>
            <h1>Publishing destinations</h1>
            <p className="admin-lead">
              Review once. Adapt to each channel. Track every publication.
            </p>
            <div className="channel-grid">
              {channels.map((channel) => (
                <article className="channel-card" key={channel.name}>
                  <h2>{channel.name}</h2>
                  <span className="task-status queued">{channel.state}</span>
                  <p>{channel.detail}</p>
                </article>
              ))}
            </div>
            <div className="next-step">
              <h2>Next: connect reviewed drafts to publication</h2>
              <p>
                Start with versioned website publication, then add
                channel-specific drafts, account connections, duplicate
                prevention, publication receipts, and performance tracking. Each
                platform needs its own integration and publishing rules.
              </p>
            </div>
          </section>
        ) : (
          <section className="admin-content">
            <div className="admin-page-heading">
              <div>
                <p className="admin-eyebrow">YOUR CONTENT TEAM</p>
                <h1>Give the team a direction.</h1>
                <p className="admin-lead">
                  Assign work, inspect the evidence, and guide the next
                  revision.
                </p>
              </div>
              <button
                className="admin-button primary"
                disabled={!data}
                onClick={() => setShowForm(!showForm)}
              >
                + Assign a task
              </button>
            </div>
            <div className="worker-strip">
              <span className={`worker-dot ${recentRunner ? "online" : ""}`} />
              {data?.counts.queued && !data.counts.running
                ? (data.dispatch?.message ?? "Requesting a worker…")
                : recentRunner
                  ? `${data?.counts.running ? "Worker running" : "Worker checked in"} · ${recentRunner.model}`
                  : "Worker idle"}
              {data?.dispatch?.runUrl && (
                <a href={data.dispatch.runUrl} target="_blank" rel="noreferrer">
                  View worker run ↗
                </a>
              )}
              {!!data?.counts.queued && data.dispatch?.nextAttemptAt && (
                <span>
                  Next startup check {when(data.dispatch.nextAttemptAt)}
                </span>
              )}
              <span>
                {data?.runners[0]
                  ? `Last heartbeat ${when(data.runners[0].lastSeenAt)}`
                  : "Tasks stay queued until a worker connects."}
              </span>
            </div>
            <div className="agent-grid">
              {roles.map((agent) => {
                const active = data?.tasks.find(
                  (t) => t.status === "running" && t.activeRole === agent.id,
                );
                const queued =
                  data?.tasks.filter(
                    (t) => t.status === "queued" && t.role === agent.id,
                  ).length ?? 0;
                return (
                  <article className="agent-card" key={agent.id}>
                    <div className="agent-card-top">
                      <span className="agent-icon">
                        {agent.work === "writer" ? "✎" : "✓"}
                      </span>
                      <span
                        className={`task-status ${active ? "running" : "queued"}`}
                      >
                        {active
                          ? "Working"
                          : queued
                            ? `${queued} queued`
                            : "Idle"}
                      </span>
                    </div>
                    <h2>{agent.name}</h2>
                    <p>{agent.description}</p>
                    {data?.runners[0] && (
                      <small className="agent-model">
                        {agent.work === "reviewer"
                          ? data.runners[0].reviewerModel
                          : data.runners[0].model}
                      </small>
                    )}
                    <button
                      onClick={() => {
                        setRole(agent.id);
                        setShowForm(true);
                        setTimeout(
                          () =>
                            formRef.current?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            }),
                          50,
                        );
                      }}
                    >
                      {active ? active.stage : "Assign work"} →
                    </button>
                  </article>
                );
              })}
            </div>
            {showForm && (
              <form className="task-form" ref={formRef} onSubmit={submit}>
                <div className="form-heading">
                  <h2>Assign a task</h2>
                  <button type="button" onClick={() => setShowForm(false)}>
                    Close
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Agent
                    <select
                      aria-label="Agent"
                      value={role}
                      onChange={(event) => setRole(event.target.value as Role)}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {chosenRole.work === "reviewer"
                      ? "Article to review"
                      : "Existing article (optional)"}
                    <select
                      name="articleId"
                      key={role}
                      required={chosenRole.work === "reviewer"}
                    >
                      <option value="">
                        {chosenRole.work === "reviewer"
                          ? "Select an article"
                          : "Write a new article"}
                      </option>
                      {catalog.map((a) => (
                        <option value={a.id} key={a.id}>
                          {a.title} · {a.version}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Task title
                  <input
                    name="title"
                    minLength={3}
                    maxLength={160}
                    required
                    placeholder="Explain how to evaluate Lavik for a growing Redis dataset"
                  />
                </label>
                <label>
                  Brief
                  <textarea
                    name="brief"
                    minLength={10}
                    maxLength={12000}
                    required
                    rows={4}
                    placeholder="Audience, topic, desired outcome, sources to inspect, and any specific feedback…"
                  />
                </label>
                <div className="form-footer">
                  <p>
                    English + 简体中文 · Version 0.1.0 · Writers verify examples
                    and receive independent review. Results remain private
                    drafts.
                  </p>
                  <button
                    className="admin-button primary"
                    disabled={busy || !data}
                  >
                    {busy ? "Saving…" : "Queue task →"}
                  </button>
                </div>
              </form>
            )}
            <div className="task-section-heading">
              <h2>
                Task activity{" "}
                <span>
                  {data
                    ? Object.values(data.counts).reduce((a, b) => a + b, 0)
                    : 0}
                </span>
              </h2>
              <label className="filter-label">
                Show
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All statuses</option>
                  {Object.entries(labels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={`task-workspace ${selected ? "has-detail" : ""}`}>
              <div className="task-list">
                {!data ? (
                  <div className="empty-state">
                    <h3>Connecting to your workspace…</h3>
                    <p>Task status will appear here after sign-in.</p>
                  </div>
                ) : !visible.length ? (
                  <div className="empty-state">
                    <span>✎</span>
                    <h3>No tasks here yet.</h3>
                    <p>
                      Start with a writing brief or ask a reviewer to inspect an
                      existing article.
                    </p>
                    <button
                      className="admin-button"
                      onClick={() => setShowForm(true)}
                    >
                      Assign the first task
                    </button>
                  </div>
                ) : (
                  visible.map((task) => (
                    <button
                      key={task.id}
                      className={`task-row ${selected === task.id ? "selected" : ""}`}
                      onClick={() => setSelected(task.id)}
                    >
                      <div>
                        <span className={`task-status ${task.status}`}>
                          {labels[task.status]}
                        </span>
                        <small>{when(task.createdAt)}</small>
                      </div>
                      <h3>{task.title}</h3>
                      <p>{roles.find((r) => r.id === task.role)?.name}</p>
                      <small>
                        {task.status === "queued"
                          ? data.counts.running
                            ? "Queued behind the current task"
                            : data.dispatch?.state === "starting"
                              ? "Worker starting"
                              : data.dispatch?.state === "retrying"
                                ? "Worker startup will retry"
                                : data.dispatch?.state === "unconfigured"
                                  ? "Worker connection required"
                                  : "Worker startup scheduled"
                          : task.stage}
                      </small>
                    </button>
                  ))
                )}
              </div>
              {selected && (
                <section className="task-detail" aria-label="Task details">
                  <div className="form-heading">
                    <h2>Task details</h2>
                    <button onClick={() => setSelected(undefined)}>
                      Close
                    </button>
                  </div>
                  {!detail ? (
                    <p>Loading task…</p>
                  ) : (
                    <>
                      <span className={`task-status ${detail.task.status}`}>
                        {labels[detail.task.status]}
                      </span>
                      <h2 className="task-title">{detail.task.title}</h2>
                      <p className="task-brief">{detail.task.brief}</p>
                      <div className="task-meta">
                        <span>
                          {roles.find((r) => r.id === detail.task.role)?.name}
                        </span>
                        <span>Updated {when(detail.task.updatedAt)}</span>
                        {detail.task.runUrl && (
                          <a
                            href={detail.task.runUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Worker run ↗
                          </a>
                        )}
                        {detail.task.parentId && (
                          <button
                            onClick={() => setSelected(detail.task.parentId)}
                          >
                            View previous attempt
                          </button>
                        )}
                        <a
                          href={`/api/admin/tasks/${detail.task.id}/export`}
                          download={`lavik-task-${detail.task.id}.json`}
                        >
                          Export task & evidence
                        </a>
                      </div>
                      {detail.task.error && (
                        <p className="task-error">{detail.task.error}</p>
                      )}
                      {detail.task.result && (
                        <>
                          <div
                            className="edition-tabs"
                            aria-label="Draft language"
                          >
                            {["en", "zh-CN"].map((value) => (
                              <button
                                key={value}
                                aria-pressed={locale === value}
                                onClick={() => setLocale(value)}
                              >
                                {value === "en" ? "English" : "简体中文"}
                              </button>
                            ))}
                            <span>Private draft</span>
                          </div>
                          {edition ? (
                            <Preview
                              edition={edition}
                              references={detail.task.result.references}
                            />
                          ) : (
                            <p>This edition has not been saved yet.</p>
                          )}
                        </>
                      )}
                      <div className="feedback-box">
                        <h3>Guide the next revision</h3>
                        <label htmlFor="task-feedback">
                          Feedback
                          <textarea
                            id="task-feedback"
                            rows={3}
                            maxLength={8000}
                            value={feedback}
                            onChange={(event) =>
                              setFeedback(event.target.value)
                            }
                            placeholder="What should the agent clarify, correct, or explore?"
                          />
                        </label>
                        <p>
                          Comments are saved immediately. Request a revision to
                          apply feedback to a new attempt.
                        </p>
                        <div className="feedback-actions">
                          <button
                            className="admin-button"
                            disabled={busy || !feedback.trim()}
                            onClick={() => void act("comment")}
                          >
                            Save feedback
                          </button>
                          {terminal(detail.task.status) ? (
                            <>
                              <button
                                className="admin-button primary"
                                disabled={
                                  busy ||
                                  !feedback.trim() ||
                                  !detail.task.result
                                }
                                onClick={() => void act("revise")}
                              >
                                Request revision
                              </button>
                              {["failed", "cancelled"].includes(
                                detail.task.status,
                              ) && (
                                <button
                                  className="admin-button"
                                  disabled={busy}
                                  onClick={() => void act("retry")}
                                >
                                  Retry task
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              className="admin-button danger"
                              disabled={busy}
                              onClick={() => void act("cancel")}
                            >
                              Cancel task
                            </button>
                          )}
                        </div>
                      </div>
                      <details className="task-history" open>
                        <summary>Task history</summary>
                        <ol>
                          {detail.events.map((event) => (
                            <li key={event.id}>
                              <span>{when(event.at)}</span>
                              <strong>{event.type.replaceAll("-", " ")}</strong>
                              <p>{event.message}</p>
                              {event.data && (
                                <details>
                                  <summary>Details</summary>
                                  <pre>
                                    {JSON.stringify(event.data, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </>
                  )}
                </section>
              )}
            </div>
            <p className="workspace-note">
              One task runs at a time. Worker heartbeats and task history show
              actual execution. Closing this page does not cancel work. Showing
              the latest 100 tasks.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
