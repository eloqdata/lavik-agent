/* First-party console. No external scripts, trackers, credentials, or model calls. */
"use strict";
const $ = (id) => document.getElementById(id);
const platforms = [
  "x",
  "reddit",
  "medium",
  "wechat",
  "rednote",
  "github",
  "discord",
  "slack",
  "newsletter",
];
let session,
  placements = [],
  links = [],
  catalogue = { articles: [], paths: [] },
  report,
  previous,
  reportEpoch = 0,
  qrSvg = "",
  qrFilename = "share.svg";
const activation =
  new URLSearchParams(location.hash.slice(1)).get("setup") || "";
if (location.hash) history.replaceState(null, "", "/");
let noticeTimer;
function notice(message, error = false) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").className = error ? "error" : "";
  $("notice").hidden = false;
  noticeTimer = setTimeout(
    () => {
      $("notice").hidden = true;
    },
    error ? 15000 : 6000,
  );
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function listen(id, event, fn) {
  $(id).addEventListener(event, async (e) => {
    if (event === "submit") e.preventDefault();
    const button =
      event === "submit"
        ? e.currentTarget.querySelector('button[type="submit"]')
        : e.currentTarget.tagName === "BUTTON"
          ? e.currentTarget
          : null;
    if (button) button.disabled = true;
    try {
      await fn(e);
    } catch (error) {
      notice(error.message || "Something went wrong. Please try again.", true);
    } finally {
      if (button) button.disabled = false;
    }
  });
}
function action(text, fn, secondary = true) {
  const button = el("button", text, secondary ? "secondary" : "");
  button.type = "button";
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await fn();
    } catch (e) {
      notice(e.message, true);
    } finally {
      button.disabled = false;
    }
  });
  return button;
}
async function api(endpoint, method = "GET", body) {
  const response = await fetch(`/api/${endpoint}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session?.csrf ? { "X-CSRF-Token": session.csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (
      response.status === 401 &&
      !["login", "recover", "password"].includes(endpoint)
    )
      showLogin();
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}
function showLogin() {
  session = undefined;
  reportEpoch++;
  $("login").hidden = false;
  $("setup").hidden = true;
  $("workspace").hidden = true;
}
function table(
  container,
  headers,
  rows,
  empty = "No recorded activity for this selection.",
) {
  container.replaceChildren();
  if (!rows.length) {
    container.append(el("p", empty, "empty"));
    return;
  }
  const t = el("table"),
    head = el("thead"),
    tr = el("tr"),
    body = el("tbody");
  for (const h of headers) {
    const th = el("th", h);
    th.scope = "col";
    tr.append(th);
  }
  head.append(tr);
  t.append(head);
  for (const row of rows) {
    const r = el("tr");
    for (const value of row) {
      const cell = el("td");
      cell.append(
        value instanceof Node ? value : document.createTextNode(String(value)),
      );
      r.append(cell);
    }
    body.append(r);
  }
  t.append(body);
  container.append(t);
}
function options(select, entries, placeholder) {
  const old = select.value;
  select.replaceChildren();
  for (const [value, text] of [
    ...(placeholder ? [["", placeholder]] : []),
    ...entries,
  ]) {
    const option = el("option", text);
    option.value = value;
    select.append(option);
  }
  if ([...select.options].some((o) => o.value === old)) select.value = old;
}
function sourceLabel(value) {
  return (
    {
      x: "X",
      wechat: "WeChat",
      github: "GitHub",
      chatgpt: "ChatGPT",
      direct: "Direct / unknown",
    }[value] || value[0].toUpperCase() + value.slice(1).replaceAll("_", " ")
  );
}
function tab(name) {
  document.querySelectorAll(".tab").forEach((n) => {
    n.hidden = n.id !== `tab-${name}`;
  });
  document.querySelectorAll("[data-tab]").forEach((n) => {
    if (n.dataset.tab === name) n.setAttribute("aria-current", "page");
    else n.removeAttribute("aria-current");
  });
  if (name === "overview" && report && previous) renderReport();
}
function csv(rows) {
  return (
    rows
      .map((row) =>
        row
          .map((v) => {
            let s = String(v ?? "");
            if (/^[\s]*[=+@-]|^[\t\r\n]/.test(s)) s = `'${s}`;
            return `"${s.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\n") + "\n"
  );
}
function download(filename, contents, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = el("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copy(value) {
  await navigator.clipboard.writeText(value);
  notice("Copied to clipboard.");
}
async function acceptSession(data) {
  session = data;
  $("login").hidden = true;
  if (data.mustChangePassword) {
    $("setup").hidden = false;
    $("workspace").hidden = true;
    return;
  }
  $("setup").hidden = true;
  $("workspace").hidden = false;
  if (data.recoveryKey) {
    $("recovery-key").value = data.recoveryKey;
    $("recovery-dialog").showModal();
  }
  await loadWorkspace();
}
async function loadWorkspace() {
  const [p, c, l] = await Promise.all([
    api("placements"),
    api("catalogue"),
    api("links"),
  ]);
  placements = p.placements;
  catalogue = c;
  links = l.links;
  options(
    $("source"),
    [
      ...platforms,
      "google",
      "bing",
      "duckduckgo",
      "baidu",
      "chatgpt",
      "claude",
      "perplexity",
      "direct",
      "other_campaign",
      "other_referral",
    ].map((s) => [s, sourceLabel(s)]),
    "All platforms",
  );
  const articles = [
    ...new Map(
      catalogue.articles.filter((a) => a.locale === "en").map((a) => [a.id, a]),
    ).values(),
  ];
  options(
    $("campaign"),
    articles.map((a) => [a.id, a.title || a.id]),
    "All campaigns",
  );
  options(
    $("link-article"),
    catalogue.articles.map((a) => [
      `${a.id}/${a.locale}`,
      `${a.locale === "en" ? "EN" : "中文"} · ${a.title || a.id}`,
    ]),
  );
  options(
    $("link-path"),
    catalogue.paths.map((p) => [p, p]),
  );
  updateLinkPath();
  renderPlacements();
  renderLinks();
  await loadReport();
}
function placementOptions() {
  options(
    $("placement"),
    placements
      .filter((p) => !$("source").value || p.source === $("source").value)
      .map((p) => [p.code, `${p.label} (${p.code})`])
      .concat([
        ["untagged", "Untagged / historical"],
        ["unregistered", "Unregistered tag"],
      ]),
    "All placements",
  );
}
function renderPlacements() {
  placementOptions();
  table(
    $("placement-editor"),
    ["Platform", "Code", "Private name", "Status", "Actions"],
    placements.map((p) => {
      const input = el("input");
      input.value = p.label;
      input.maxLength = 100;
      input.setAttribute("aria-label", `Name for ${p.code}`);
      const controls = el("div", undefined, "cell-actions");
      controls.append(
        action("Save name", async () => {
          await api(`placements/${p.code}`, "PATCH", { label: input.value });
          p.label = input.value.trim();
          renderPlacements();
          renderLinks();
          notice("Placement name updated.");
        }),
        action(p.active ? "Archive" : "Restore", async () => {
          if (
            p.active &&
            !confirm(
              `Archive ${p.label}? Its short links will stop opening. Historical reports are retained.`,
            )
          )
            return;
          const result = await api(`placements/${p.code}`, "PATCH", {
            active: !p.active,
          });
          placements = result.placements;
          renderPlacements();
          renderLinks();
          notice("Placement updated.");
        }),
      );
      return [
        sourceLabel(p.source),
        el("span", p.code, "mono"),
        input,
        el(
          "span",
          p.active ? "Active" : "Archived",
          `badge${p.active ? "" : " off"}`,
        ),
        controls,
      ];
    }),
  );
  const selected = new Set(
    [...$("link-placements").querySelectorAll("input:checked")].map(
      (i) => i.value,
    ),
  );
  $("link-placements").replaceChildren();
  for (const p of placements.filter((p) => p.active)) {
    const label = el("label"),
      input = el("input");
    input.type = "checkbox";
    input.value = p.code;
    input.checked = selected.has(p.code);
    label.append(
      input,
      document.createTextNode(`${p.label} · ${sourceLabel(p.source)}`),
    );
    $("link-placements").append(label);
  }
}
function updateLinkPath() {
  const article = catalogue.articles.find(
    (a) => `${a.id}/${a.locale}` === $("link-article").value,
  );
  if (article) $("link-path").value = new URL(article.canonical).pathname;
}
function visibleLinks() {
  const search = $("link-search").value.toLowerCase();
  return links.filter((l) =>
    [
      l.source,
      l.campaign,
      l.placement,
      placements.find((p) => p.code === l.placement)?.label || l.label,
      l.path,
      l.url,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search),
  );
}
function showQr(link) {
  const qr = qrcode(0, "M");
  qr.addData(link.url);
  qr.make();
  qrSvg = qr.createSvgTag({ cellSize: 6, margin: 24, scalable: true });
  qrFilename = `lavik-${link.placement}-${link.id}.svg`;
  $("qr-title").textContent =
    `${placements.find((p) => p.code === link.placement)?.label || link.placement} · QR code`;
  $("qr-image").src =
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg)}`;
  $("qr-url").textContent = link.url;
  $("qr-dialog").showModal();
}
function renderLinks() {
  table(
    $("link-table"),
    ["Placement", "Destination", "Share link", "Status", "Actions"],
    visibleLinks().map((l) => {
      const p = placements.find((p) => p.code === l.placement),
        place = el("div", p?.label || l.placement);
      place.append(el("small", `${sourceLabel(l.source)} · ${l.placement}`));
      const target = el("div", l.campaign);
      target.append(el("small", l.path));
      const value = el("span", l.url, "mono link-value"),
        actions = el("div", undefined, "cell-actions");
      actions.append(
        action("Copy", () => copy(l.url)),
        action("QR", () => showQr(l)),
        action(l.active ? "Disable" : "Enable", async () => {
          await api(`links/${l.id}`, "PATCH", { active: !l.active });
          l.active = l.active ? 0 : 1;
          renderLinks();
        }),
      );
      return [
        place,
        target,
        value,
        el(
          "span",
          l.active && p?.active ? "Active" : "Inactive",
          `badge${l.active && p?.active ? "" : " off"}`,
        ),
        actions,
      ];
    }),
    "No share links yet. Choose an article and placements above to generate your first batch.",
  );
}
const blank = () => ({
  visit: 0,
  pageview: 0,
  engaged: 0,
  install: 0,
  download: 0,
  github: 0,
  community: 0,
});
function aggregate(rows, key) {
  const groups = new Map();
  for (const row of rows || []) {
    if (row.source === "diagnostic") continue;
    const id = key(row),
      group = groups.get(id) || { id, ...blank() };
    if (Object.hasOwn(blank(), row.event)) group[row.event] += row.count;
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) => b.visit - a.visit || a.id.localeCompare(b.id),
  );
}
function preset(days) {
  const now = new Date(),
    end = now.toISOString().slice(0, 10),
    start = new Date(`${end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  $("from").value = start.toISOString().slice(0, 10);
  $("through").value = end;
}
function range() {
  const since = new Date(`${$("from").value}T00:00:00Z`),
    until = new Date(`${$("through").value}T00:00:00Z`);
  until.setUTCDate(until.getUTCDate() + 1);
  if (
    !Number.isFinite(since.getTime()) ||
    !Number.isFinite(until.getTime()) ||
    until <= since ||
    until - since > 90 * 86400000 ||
    $("through").value > new Date().toISOString().slice(0, 10)
  )
    throw new Error(
      "Choose a date range of 1–90 days, ending today or earlier (UTC).",
    );
  const params = new URLSearchParams({
    since: since.toISOString(),
    until: until.toISOString(),
  });
  for (const key of ["source", "placement", "campaign"])
    if ($(key).value) params.set(key, $(key).value);
  return params;
}
async function loadReport() {
  const epoch = ++reportEpoch;
  const params = range();
  $("report-status").textContent = "Refreshing traffic…";
  try {
    const data = await api(`report?${params}`);
    const prevEnd = new Date(data.since),
      prevStart = new Date(
        prevEnd.getTime() -
          (new Date(data.until).getTime() - prevEnd.getTime()),
      );
    const before = new URLSearchParams(params);
    before.set("since", prevStart.toISOString());
    before.set("until", prevEnd.toISOString());
    const prior = await api(`report?${before}`);
    if (epoch !== reportEpoch || !session) return;
    report = data;
    previous = prior;
    renderReport();
  } catch (error) {
    if (epoch === reportEpoch)
      $("report-status").textContent =
        "Could not refresh. Any displayed numbers are from the previous successful request.";
    throw error;
  }
}
function placementMetrics() {
  const groups = aggregate(
    report.rows,
    (r) => `${r.source}/${r.placement || "untagged"}`,
  );
  return groups.map((g) => {
    const [source, code] = g.id.split("/");
    return {
      ...g,
      source,
      code,
      label:
        placements.find((p) => p.code === code && p.source === source)?.label ||
        code,
    };
  });
}
function renderReport() {
  const total = aggregate(report.rows, () => "all")[0] || blank(),
    old = aggregate(previous.rows, () => "all")[0] || blank();
  $("report-status").textContent =
    `Updated ${new Date(report.generatedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC · ${report.provisional ? "Includes the current, provisional hour" : "Completed hours"} · Changes compare the preceding interval of equal length.`;
  $("metrics").replaceChildren();
  for (const [key, name] of [
    ["visit", "Visits"],
    ["engaged", "Engaged visits"],
    ["install", "Installation interest"],
    ["download", "Download clicks"],
    ["github", "GitHub clicks"],
    ["community", "Community clicks"],
  ]) {
    const card = el("div", undefined, "metric"),
      change = total[key] - old[key];
    card.append(
      el("p", name),
      el("strong", total[key].toLocaleString()),
      el(
        "span",
        `${change >= 0 ? "+" : ""}${change.toLocaleString()} vs previous interval`,
      ),
    );
    $("metrics").append(card);
  }
  table(
    $("platform-table"),
    [
      "Platform",
      "Visits",
      "Page views",
      "Engaged",
      "Install guide",
      "Downloads",
      "GitHub",
      "Community",
    ],
    aggregate(report.rows, (r) => r.source).map((g) => [
      sourceLabel(g.id),
      g.visit,
      g.pageview,
      g.engaged,
      g.install,
      g.download,
      g.github,
      g.community,
    ]),
  );
  const rate = (actions, visits) =>
    visits ? `${((100 * actions) / visits).toFixed(1)}%` : "—";
  table(
    $("placement-table"),
    [
      "Group / placement",
      "Platform",
      "Visits",
      "Engaged",
      "Engagement rate",
      "Install guide",
      "Downloads",
    ],
    placementMetrics().map((g) => {
      const name = el("div", g.label);
      name.append(el("small", g.code));
      return [
        name,
        sourceLabel(g.source),
        g.visit,
        g.engaged,
        rate(g.engaged, g.visit),
        g.install,
        g.download,
      ];
    }),
  );
  table(
    $("page-table"),
    [
      "Page",
      "Page views",
      "Landing visits",
      "Engaged",
      "Install guide",
      "Downloads",
    ],
    aggregate(report.rows, (r) => r.path)
      .sort((a, b) => b.pageview - a.pageview)
      .map((g) => [
        el("span", g.id, "mono page-path"),
        g.pageview,
        g.visit,
        g.engaged,
        g.install,
        g.download,
      ]),
  );
  drawChart();
}
function svgNode(tag, attrs) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
function drawChart() {
  const series = new Map(
    (report.series || [])
      .filter((r) => r.event === "visit")
      .map((r) => [r.day, r.count]),
  );
  const days = [],
    end = new Date(report.until);
  for (
    let d = new Date(report.since);
    d < end;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    days.push([
      d.toISOString().slice(0, 10),
      series.get(d.toISOString().slice(0, 10)) || 0,
    ]);
  const chartWidth = Math.max(260, $("chart").clientWidth),
    max = Math.max(1, ...days.map((d) => d[1])),
    svg = svgNode("svg", {
      viewBox: `0 0 ${chartWidth} 180`,
      role: "img",
      "aria-label":
        "Daily website visits; exact counts available in the table below",
    });
  svg.append(
    svgNode("line", {
      x1: 10,
      x2: chartWidth - 10,
      y1: 148,
      y2: 148,
      stroke: "#d9d8cd",
    }),
  );
  days.forEach(([day, n], i) => {
    const width = (chartWidth - 40) / days.length,
      height = (n / max) * 122,
      rect = svgNode("rect", {
        x: 10 + i * width,
        y: 148 - height,
        width: Math.max(1, width - Math.min(7, width / 3)),
        height: Math.max(1, height),
        rx: 2,
        fill: "#658768",
      });
    const title = svgNode("title", {});
    title.textContent = `${day}: ${n} visits`;
    rect.append(title);
    svg.append(rect);
    if (width >= 45 || i === 0 || i === days.length - 1) {
      const text = svgNode("text", {
        x: 10 + i * width,
        y: 170,
        class: "chart-label",
      });
      text.textContent = day.slice(5);
      svg.append(text);
    }
  });
  const details = el("details"),
    summary = el("summary", "View daily counts"),
    target = el("div", undefined, "table-scroll");
  details.append(summary, target);
  table(target, ["Date (UTC)", "Visits"], days);
  $("chart").replaceChildren(svg, details);
}
async function changePassword(form) {
  const data = Object.fromEntries(new FormData(form));
  if (data.newPassword !== data.confirm)
    throw new Error("The new passwords do not match.");
  const result = await api("password", "POST", {
    currentPassword: data.currentPassword,
    newPassword: data.newPassword,
  });
  form.reset();
  await acceptSession(result);
  notice("Password changed. Save your new recovery key.");
}
listen("login-form", "submit", async (e) => {
  const form = e.currentTarget,
    body = Object.fromEntries(new FormData(form));
  await acceptSession(await api("login", "POST", { ...body, activation }));
  form.reset();
});
listen("recover-form", "submit", async (e) => {
  const form = e.currentTarget,
    data = Object.fromEntries(new FormData(form));
  if (data.newPassword !== data.confirm)
    throw new Error("The new passwords do not match.");
  await acceptSession(
    await api("recover", "POST", {
      username: "admin",
      recoveryKey: data.recoveryKey,
      newPassword: data.newPassword,
    }),
  );
  form.reset();
});
listen("setup-form", "submit", (e) => changePassword(e.currentTarget));
listen("password-form", "submit", (e) => changePassword(e.currentTarget));
listen("logout", "click", async () => {
  await api("logout", "POST", {});
  showLogin();
});
document
  .querySelectorAll("[data-tab]")
  .forEach((n) => n.addEventListener("click", () => tab(n.dataset.tab)));
listen("copy-recovery", "click", () => copy($("recovery-key").value));
listen("saved-recovery", "click", () => {
  $("recovery-key").value = "";
  $("recovery-dialog").close();
});
$("recovery-dialog").addEventListener("cancel", (e) => e.preventDefault());
listen("download-qr", "click", () =>
  download(qrFilename, qrSvg, "image/svg+xml"),
);
listen("close-qr", "click", () => $("qr-dialog").close());
listen("filters", "submit", loadReport);
listen("refresh", "click", loadReport);
listen("period", "change", () => {
  if ($("period").value !== "custom") preset(Number($("period").value));
});
for (const id of ["from", "through"])
  listen(id, "change", () => {
    $("period").value = "custom";
  });
listen("source", "change", placementOptions);
listen("placement-form", "submit", async (e) => {
  const form = e.currentTarget,
    result = await api(
      "placements",
      "POST",
      Object.fromEntries(new FormData(form)),
    );
  placements = result.placements;
  form.reset();
  renderPlacements();
  notice("Placement added.");
});
listen("link-article", "change", updateLinkPath);
listen("link-search", "input", renderLinks);
listen("select-all", "click", () => {
  const boxes = [...$("link-placements").querySelectorAll("input")],
    all = boxes.every((b) => b.checked);
  boxes.forEach((b) => {
    b.checked = !all;
  });
  $("select-all").textContent = all ? "Select all active" : "Clear selection";
});
listen("link-form", "submit", async () => {
  const selected = [
    ...$("link-placements").querySelectorAll("input:checked"),
  ].map((i) => i.value);
  if (!selected.length || selected.length > 100)
    throw new Error("Choose between 1 and 100 placements.");
  const article = catalogue.articles.find(
    (a) => `${a.id}/${a.locale}` === $("link-article").value,
  );
  if (!article) throw new Error("Choose an article.");
  const result = await api("links", "POST", {
    campaign: article.id,
    path: $("link-path").value,
    placements: selected,
  });
  links = (await api("links")).links;
  renderLinks();
  notice(`${result.links.length} share links are ready.`);
});
listen("export-links", "click", () =>
  download(
    "lavik-share-links.csv",
    csv([
      [
        "platform",
        "placement",
        "private_name",
        "campaign",
        "destination",
        "share_link",
        "tagged_url",
        "active",
      ],
      ...visibleLinks().map((l) => [
        l.source,
        l.placement,
        placements.find((p) => p.code === l.placement)?.label || l.label,
        l.campaign,
        l.path,
        l.url,
        l.taggedUrl,
        Boolean(
          l.active && placements.find((p) => p.code === l.placement)?.active,
        ),
      ]),
    ]),
  ),
);
listen("export-events", "click", () => {
  if (!report) throw new Error("Load a report first.");
  download(
    "lavik-traffic-events.csv",
    csv([
      ["source", "medium", "campaign", "placement", "path", "event", "count"],
      ...report.rows
        .filter((r) => r.source !== "diagnostic")
        .map((r) => [
          r.source,
          r.medium,
          r.campaign,
          r.placement || "untagged",
          r.path,
          r.event,
          r.count,
        ]),
    ]),
  );
});
listen("export-groups", "click", () => {
  if (!report) throw new Error("Load a report first.");
  download(
    "lavik-group-performance.csv",
    csv([
      [
        "platform",
        "placement",
        "private_name",
        "visits",
        "engaged",
        "install_guide",
        "downloads",
      ],
      ...placementMetrics().map((g) => [
        g.source,
        g.code,
        g.label,
        g.visit,
        g.engaged,
        g.install,
        g.download,
      ]),
    ]),
  );
});
options(
  $("new-source"),
  platforms.map((s) => [s, sourceLabel(s)]),
);
preset(7);
window.addEventListener("resize", () => {
  if (report && !$("tab-overview").hidden) drawChart();
});
if (activation)
  $("activation-note").textContent =
    "Private activation link loaded. Sign in with admin / admin, then choose your own password.";
api("session")
  .then(acceptSession)
  .catch((error) => {
    showLogin();
    if (
      !error.message.includes("sign in") &&
      !error.message.includes("session expired")
    )
      notice(error.message, true);
  });
