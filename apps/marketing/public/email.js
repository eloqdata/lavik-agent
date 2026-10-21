/* Private email console. Contact data never enters public page assets or analytics. */
"use strict";
let emailJobs = [],
  emailOffset = 0,
  emailContactMore = false,
  emailDetailId = "",
  emailRecipientOffset = 0;
const emailNode = (id) => document.getElementById(id);
function emailTargets() {
  return shareTargets().filter((p) => p.locale === "en");
}
async function refreshEmail() {
  if (!session) return;
  emailNode("email-status").textContent = "Refreshing email workspace…";
  const [state, list] = await Promise.all([
    api("email/status"),
    api("email/jobs"),
  ]);
  emailJobs = list.jobs;
  emailNode("email-status").textContent =
    `${state.contacts.toLocaleString()} contacts · ${state.suppressed.toLocaleString()} suppressed · ${state.attempts24h}/${state.settings.daily_limit} attempts in 24 hours · Sending ${state.settings.enabled ? "enabled" : "paused"}${state.settings.last_error ? " · " + state.settings.last_error : ""}`;
  emailNode("email-connection").textContent = state.outlookConfigured
    ? "Outlook credentials are configured. Authorization is checked when sending."
    : "Outlook is not connected yet. Import and draft preparation are available.";
  emailNode("email-address").value = state.settings.postal_address;
  emailNode("email-limit").value = state.settings.daily_limit;
  emailNode("email-interval").value = state.settings.interval_seconds;
  emailNode("email-enabled").checked = state.settings.enabled;
  options(
    emailNode("email-target"),
    emailTargets().map((p) => [
      p.id + "|" + new URL(p.canonical).pathname,
      p.title || p.id,
    ]),
  );
  const until = new Date(),
    since = new Date(until.getTime() - 30 * 86400000);
  let traffic = [];
  try {
    traffic = (
      await api(
        "report?" +
          new URLSearchParams({
            since: since.toISOString(),
            until: until.toISOString(),
            source: "email",
          }),
      )
    ).rows;
  } catch {
    notice(
      "Email jobs loaded; traffic reporting is temporarily unavailable.",
      true,
    );
  }
  renderEmailJobs(traffic);
  await emailContacts();
}
async function emailContacts() {
  const data = await api(
    "email/contacts?" +
      new URLSearchParams({
        q: emailNode("email-contact-q").value,
        domain: emailNode("email-contact-domain").value,
        offset: String(emailOffset),
      }),
  );
  emailContactMore = data.hasMore;
  emailNode("email-contact-page").textContent =
    `Showing ${emailOffset + 1}–${emailOffset + data.contacts.length}`;
  emailNode("email-contacts-prev").disabled = emailOffset === 0;
  emailNode("email-contacts-next").disabled = !data.hasMore;
  table(
    emailNode("email-contacts"),
    ["Name", "Email", "Status", "Action"],
    data.contacts.map((c) => [
      [c.first_name, c.last_name].filter(Boolean).join(" ") || "—",
      c.email,
      c.suppression ||
        (c.archived
          ? "Archived"
          : c.recently_contacted
            ? "Contacted within 30 days"
            : "Available"),
      c.suppression
        ? "—"
        : action("Suppress", async () => {
            if (confirm(`Stop all outreach to ${c.email}?`)) {
              await api("email/suppress", "POST", {
                email: c.email,
                reason: "manual",
              });
              await emailContacts();
            }
          }),
    ]),
    "No contacts match this search.",
  );
}
function editEmail(job, clone = false) {
  emailNode("email-editor-panel").open = true;
  emailNode("email-job-id").value = clone ? "" : job.id;
  emailNode("email-job-name").value = job.name + (clone ? " (copy)" : "");
  emailNode("email-target").value = job.campaign + "|" + job.path;
  emailNode("email-job-domain").value = job.audience.domain;
  emailNode("email-job-search").value = job.audience.search;
  emailNode("email-job-limit").value = job.audience.limit;
  emailNode("email-job-schedule").value = "";
  for (const v of ["a", "b"]) {
    emailNode("email-subject-" + v).value = job.content[v]?.subject || "";
    emailNode("email-body-" + v).value = job.content[v]?.body || "";
  }
  emailNode("email-editor-panel").scrollIntoView({ behavior: "smooth" });
}
function renderEmailJobs(traffic) {
  const target = emailNode("email-jobs");
  target.replaceChildren();
  if (!emailJobs.length) {
    target.append(
      el(
        "p",
        "No jobs yet. Create a draft to choose your audience and messages.",
      ),
    );
    return;
  }
  for (const j of emailJobs) {
    const card = el("article", undefined, "email-job"),
      head = el("div", undefined, "section-heading");
    head.append(el("h3", j.name), el("span", j.status, "badge"));
    const actions = el("div", undefined, "cell-actions");
    actions.append(
      action("Preview / recipients", async () => {
        emailDetailId = j.id;
        emailRecipientOffset = 0;
        await emailDetails();
      }),
      action("Clone", () => editEmail(j, true)),
    );
    if (j.status === "draft")
      actions.append(action("Edit", () => editEmail(j)));
    if (["draft", "paused"].includes(j.status))
      actions.append(
        action(
          j.status === "paused" ? "Resume" : "Start job",
          async () => {
            if (
              !confirm(
                `Start ${j.name}? Up to ${j.audience.limit} eligible contacts will receive one personalized message, using your mailbox limits.`,
              )
            )
              return;
            await api(`email/jobs/${j.id}/start`, "POST", {});
            await loadWorkspace();
            await refreshEmail();
            notice("Job started. The scheduler sends automatically.");
          },
          false,
        ),
      );
    if (j.status === "running")
      actions.append(
        action("Pause", async () => {
          await api(`email/jobs/${j.id}/pause`, "POST", {});
          await refreshEmail();
        }),
      );
    if (["draft", "running", "paused"].includes(j.status))
      actions.append(
        action("Cancel", async () => {
          if (confirm("Cancel remaining messages in this job?")) {
            await api(`email/jobs/${j.id}/cancel`, "POST", {});
            await refreshEmail();
          }
        }),
      );
    card.append(
      head,
      el(
        "p",
        `${j.audience.domain || "All domains"} · ${j.audience.search || "No name filter"} · Up to ${j.audience.limit} contacts · Earliest send ${new Date(j.scheduled_at).toLocaleString()}`,
        "muted",
      ),
      actions,
    );
    const grid = el("div", undefined, "table-scroll");
    table(
      grid,
      [
        "Variant",
        "Subject",
        "Queued",
        "Accepted",
        "Uncertain / rejected",
        "Visits (30d)",
        "Engaged",
        "Install / download",
      ],
      Object.entries(j.content).map(([v, t]) => {
        const count = (status) =>
          j.counts
            .filter((c) => c.variant === v && c.status === status)
            .reduce((n, c) => n + c.count, 0);
        const rows = traffic.filter(
            (r) => r.placement === j.links[v]?.placement,
          ),
          metrics = aggregate(rows, () => v)[0] || blank();
        return [
          v.toUpperCase(),
          t.subject,
          count("pending") + count("sending"),
          count("accepted") + count("replied") + count("bounced"),
          `${count("unknown")} / ${count("rejected")}`,
          metrics.visit,
          metrics.engaged,
          `${metrics.install} / ${metrics.download}`,
        ];
      }),
    );
    card.append(grid);
    for (const [v, l] of Object.entries(j.links)) {
      const line = el("p", `${v.toUpperCase()} · ${l.placement} · `, "hint");
      line.append(
        el("span", l.url, "mono"),
        action("Copy link", () => copy(l.url)),
      );
      card.append(line);
    }
    target.append(card);
  }
}
async function emailDetails() {
  const j = emailJobs.find((j) => j.id === emailDetailId);
  if (!j) return;
  const [preview, list] = await Promise.all([
    api(`email/jobs/${j.id}/preview`),
    api(`email/jobs/${j.id}/recipients?offset=${emailRecipientOffset}`),
  ]);
  emailNode("email-detail").hidden = false;
  emailNode("email-detail-title").textContent = j.name;
  emailNode("email-preview").replaceChildren();
  for (const [key, message] of Object.entries(preview.variants)) {
    const box = el("div");
    box.append(
      el("h3", `${key.toUpperCase()}: ${message.subject}`),
      el("pre", message.body, "email-message"),
    );
    emailNode("email-preview").append(box);
  }
  table(
    emailNode("email-recipients"),
    ["Email", "Variant", "Status", "Last attempt", "Details / actions"],
    list.recipients.map((r) => {
      const actions = el("div");
      actions.append(el("small", r.last_error || ""));
      if (["accepted", "unknown"].includes(r.status))
        for (const reason of ["bounce", "reply"])
          actions.append(
            action(
              reason === "bounce" ? "Mark bounced" : "Mark replied",
              async () => {
                await api("email/suppress", "POST", { email: r.email, reason });
                await emailDetails();
              },
            ),
          );
      return [
        r.email,
        r.variant.toUpperCase(),
        r.status,
        r.attempt_at ? new Date(r.attempt_at).toLocaleString() : "—",
        actions,
      ];
    }),
    "No recipient snapshot yet. Recipients are assigned when the job starts.",
  );
  emailNode("email-recipients-prev").disabled = emailRecipientOffset === 0;
  emailNode("email-recipients-next").disabled = list.recipients.length < 50;
  emailNode("email-detail").scrollIntoView({ behavior: "smooth" });
}
listen("email-refresh", "click", refreshEmail);
listen("email-contact-search", "submit", async () => {
  emailOffset = 0;
  await emailContacts();
});
listen("email-contacts-prev", "click", async () => {
  emailOffset = Math.max(0, emailOffset - 50);
  await emailContacts();
});
listen("email-contacts-next", "click", async () => {
  if (emailContactMore) {
    emailOffset += 50;
    await emailContacts();
  }
});
listen("email-recipients-prev", "click", async () => {
  emailRecipientOffset = Math.max(0, emailRecipientOffset - 50);
  await emailDetails();
});
listen("email-recipients-next", "click", async () => {
  emailRecipientOffset += 50;
  await emailDetails();
});
listen("email-settings", "submit", async () => {
  await api("email/settings", "POST", {
    enabled: emailNode("email-enabled").checked,
    postal_address: emailNode("email-address").value,
    daily_limit: Number(emailNode("email-limit").value),
    interval_seconds: Number(emailNode("email-interval").value),
  });
  await refreshEmail();
  notice("Mailbox settings saved.");
});
listen("email-new", "click", () => {
  emailNode("email-job-form").reset();
  emailNode("email-job-id").value = "";
});
listen("email-job-form", "submit", async () => {
  const [campaign, path] = emailNode("email-target").value.split("|"),
    content = {
      a: {
        subject: emailNode("email-subject-a").value,
        body: emailNode("email-body-a").value,
      },
    };
  if (emailNode("email-subject-b").value || emailNode("email-body-b").value)
    content.b = {
      subject: emailNode("email-subject-b").value,
      body: emailNode("email-body-b").value,
    };
  const id = emailNode("email-job-id").value,
    scheduled = emailNode("email-job-schedule").value;
  await api("email/jobs" + (id ? "/" + id : ""), id ? "PATCH" : "POST", {
    name: emailNode("email-job-name").value,
    content,
    campaign,
    path,
    audience: {
      domain: emailNode("email-job-domain").value,
      search: emailNode("email-job-search").value,
      limit: Number(emailNode("email-job-limit").value),
    },
    ...(scheduled ? { scheduledAt: new Date(scheduled).toISOString() } : {}),
  });
  emailNode("email-job-form").reset();
  emailNode("email-job-id").value = "";
  await refreshEmail();
  notice("Draft saved. Preview it before starting.");
});
document.querySelector('[data-tab="email"]').addEventListener("click", () =>
  refreshEmail().catch((e) => {
    emailNode("email-status").textContent = e.message;
    notice(e.message, true);
  }),
);
