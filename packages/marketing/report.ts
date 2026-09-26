export type MetricRow = {
  source: string;
  medium: string;
  campaign: string;
  path: string;
  event: string;
  count: number;
};
export type MarketingReport = {
  since: string;
  until: string;
  generatedAt: string;
  rows: MetricRow[];
};
export function summarizeChannels(rows: MetricRow[]) {
  const groups = new Map<
    string,
    {
      source: string;
      visits: number;
      pageviews: number;
      engaged: number;
      install: number;
      download: number;
      github: number;
      community: number;
    }
  >();
  for (const r of rows) {
    // Production smoke checks use this explicit source and are never visitors.
    if (r.source === "diagnostic") continue;
    const g = groups.get(r.source) ?? {
      source: r.source,
      visits: 0,
      pageviews: 0,
      engaged: 0,
      install: 0,
      download: 0,
      github: 0,
      community: 0,
    };
    const key =
      r.event === "visit"
        ? "visits"
        : r.event === "pageview"
          ? "pageviews"
          : r.event;
    if (
      [
        "visits",
        "pageviews",
        "engaged",
        "install",
        "download",
        "github",
        "community",
      ].includes(key)
    )
      g[key as "visits"] += r.count;
    groups.set(r.source, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.install - a.install || b.visits - a.visits,
  );
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function channelInsights(
  report: MarketingReport,
  previous?: MarketingReport,
) {
  const channels = summarizeChannels(report.rows);
  const visits = channels.reduce((n, c) => n + c.visits, 0);
  if (!visits) return [];
  const unknown = channels.find((c) => c.source === "direct")?.visits ?? 0;
  const notes = [
    `Direct / unknown: ${unknown} of ${visits} visits (${Math.round((100 * unknown) / visits)}%). Tag copied links and WeChat QR destinations to reduce attribution gaps.`,
  ];
  const named = channels.filter((c) => c.source !== "direct");
  const leader = named[0];
  if (leader?.install && leader.visits >= 30)
    notes.push(
      `${leader.source} supplied the most installation-guide visits among attributed sources: ${leader.install}, from ${leader.visits} visits. Inspect its campaign/page CSV before increasing effort; this is an intent signal, not financial ROI.`,
    );
  else
    notes.push(
      "There is not yet enough attributed activity to recommend shifting effort. Collect more weeks; the 30-visit check is an editorial guardrail, not a statistical significance test.",
    );
  if (previous) {
    const old = summarizeChannels(previous.rows);
    const count = old.reduce((n, c) => n + c.visits, 0);
    if (count) {
      notes.push(
        `Total visits: ${visits} this week versus ${count} in the preceding week (${visits - count >= 0 ? "+" : ""}${visits - count}).`,
      );
      for (const c of named) {
        const prior = old.find((p) => p.source === c.source);
        if (prior)
          notes.push(
            `${c.source}: visits ${prior.visits} → ${c.visits}; installation-guide visits ${prior.install} → ${c.install}; download clicks ${prior.download} → ${c.download}.`,
          );
      }
    } else
      notes.push(
        "No recorded baseline in the preceding week; percentage growth would be misleading.",
      );
  }
  return notes;
}
export function renderReport(
  report: MarketingReport,
  previous?: MarketingReport,
) {
  const channels = summarizeChannels(report.rows);
  const head = [
    "Source",
    "Visits",
    "Page views",
    "Engaged",
    "Install guide",
    "Download clicks",
    "GitHub",
    "Community",
  ];
  const cells = channels.map((g) => [
    g.source === "direct" ? "direct / unknown" : g.source,
    g.visits,
    g.pageviews,
    g.engaged,
    g.install,
    g.download,
    g.github,
    g.community,
  ]);
  const interpretation = channels.length
    ? "Compare installation-guide visits and download intent alongside traffic volume. Do not sum the action columns as unique conversions: one visit can perform several actions. With small counts, gather more data before changing marketing allocation."
    : "No recorded traffic in this period. Collection begins when the tracker is deployed; this is not a historical backfill.";
  const insights = channelInsights(report, previous);
  const markdown = `# Lavik weekly marketing report\n\n${report.since} to ${report.until} (UTC, exclusive end). Generated ${report.generatedAt}.\n\n| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${cells.map((c) => `| ${c.join(" | ")} |`).join("\n")}\n\n${interpretation}\n\nVisits are browser-tab visits, not unique people. Engaged means at least 20 visible seconds. Direct / unknown includes copied links and apps without attribution. Cross-week activity can produce actions from visits that began before this reporting period. Download clicks do not prove installation. Blocking scripts, privacy signals, or stripped tags reduce coverage.\n\nThe CSV contains the platform/campaign/page breakdown. Tag every new external link; existing untagged X posts can be attributed to X when the referrer survives, but their campaign may remain untagged.\n`;
  const csv =
    [
      "source,medium,campaign,path,event,count",
      ...report.rows.map((r) =>
        [r.source, r.medium, r.campaign, r.path, r.event, r.count]
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      ),
    ].join("\n") + "\n";
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lavik weekly marketing report</title><style>body{font:16px/1.6 system-ui;background:#f4f0e8;color:#24221e;margin:40px auto;padding:0 24px;max-width:1200px}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #cbc4b7;text-align:left}.scroll{overflow-x:auto}h1{letter-spacing:-.03em}a{color:#225544}p{max-width:85ch}</style><h1>Lavik weekly marketing report</h1><p>${escape(report.since)} → ${escape(report.until)} · UTC</p><div class="scroll"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${cells.map((c) => `<tr>${c.map((v) => `<td>${escape(String(v))}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p>${escape(interpretation)}</p><p>Visits are browser-tab visits, not unique people. Actions are recorded when they occur, so visits spanning reporting periods can affect rates. Direct / unknown includes unattributed app and copied links. Download clicks do not prove installation.</p><p><a href="report.csv">Download campaign/page CSV</a> · <a href="report.json">Raw aggregate data</a></p></html>`;
  return {
    markdown:
      markdown +
      (insights.length
        ? `\n## Channel observations\n\n${insights.map((s) => `- ${s}`).join("\n")}\n`
        : ""),
    csv,
    html: html.replace(
      "</html>",
      insights.length
        ? `<h2>Channel observations</h2><ul>${insights.map((s) => `<li>${escape(s)}</li>`).join("")}</ul></html>`
        : "</html>",
    ),
  };
}
