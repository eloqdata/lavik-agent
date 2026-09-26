export const campaignSources = [
  "x",
  "reddit",
  "medium",
  "wechat",
  "rednote",
  "github",
  "discord",
  "slack",
  "newsletter",
] as const;
export type Attribution = { source: string; medium: string; campaign: string };
export type Visit = Attribution & {
  landing: string;
  updatedAt: number;
  visibleSeconds: number;
  events: string[];
};
export const storedSources = [
  ...campaignSources,
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
  "diagnostic",
] as const;
export const storedMedia = [
  "social",
  "referral",
  "organic",
  "email",
  "ai",
  "campaign",
  "none",
] as const;
export const safeCampaign = (value: string, allowed: readonly string[]) =>
  ["untagged", "unregistered"].includes(value) || allowed.includes(value)
    ? value
    : "unregistered";
const aliases: Record<string, string> = {
  twitter: "x",
  "twitter.com": "x",
  "x.com": "x",
  "t.co": "x",
  "medium.com": "medium",
  weixin: "wechat",
  "mp.weixin.qq.com": "wechat",
  xiaohongshu: "rednote",
};
export function normalizedSource(s: string) {
  const value = aliases[s.toLowerCase()] ?? s.toLowerCase();
  return (storedSources as readonly string[]).includes(value)
    ? value
    : "other_campaign";
}
export function attribution(
  url: string,
  referrer: string,
  campaigns: readonly string[] = [],
): Attribution | null {
  const page = new URL(url);
  if (page.searchParams.get("utm_source")) {
    const source = normalizedSource(page.searchParams.get("utm_source")!);
    return {
      source: source || "unknown",
      medium: (storedMedia as readonly string[]).includes(
        page.searchParams.get("utm_medium") ?? "",
      )
        ? page.searchParams.get("utm_medium")!
        : "campaign",
      campaign: safeCampaign(
        page.searchParams.get("utm_campaign") || "untagged",
        campaigns,
      ),
    };
  }
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (
      host === page.hostname ||
      host === "lavik.dev" ||
      host.endsWith(".lavik.dev")
    )
      return null;
    const domains: [string, string, string][] = [
      ["t.co", "x", "social"],
      ["x.com", "x", "social"],
      ["twitter.com", "x", "social"],
      ["reddit.com", "reddit", "social"],
      ["medium.com", "medium", "referral"],
      ["weixin.qq.com", "wechat", "social"],
      ["wechat.com", "wechat", "social"],
      ["xiaohongshu.com", "rednote", "social"],
      ["github.com", "github", "referral"],
      ["discord.com", "discord", "social"],
      ["slack.com", "slack", "social"],
      ["chatgpt.com", "chatgpt", "ai"],
      ["claude.ai", "claude", "ai"],
      ["perplexity.ai", "perplexity", "ai"],
      ["bing.com", "bing", "organic"],
      ["duckduckgo.com", "duckduckgo", "organic"],
      ["baidu.com", "baidu", "organic"],
    ];
    if (
      /^(?:[^.]+\.)?google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/.test(
        host,
      )
    )
      return { source: "google", medium: "organic", campaign: "untagged" };
    const found = domains.find(([d]) => host === d || host.endsWith(`.${d}`));
    return {
      source: found?.[1] ?? "other_referral",
      medium: found?.[2] ?? "referral",
      campaign: "untagged",
    };
  } catch {
    return null;
  }
}
export function resolveVisit(
  url: string,
  referrer: string,
  previous: Visit | undefined,
  now: number,
  campaigns: readonly string[] = [],
): { visit: Visit; started: boolean } {
  const incoming = attribution(url, referrer, campaigns);
  const fresh =
    previous &&
    now >= previous.updatedAt &&
    now - previous.updatedAt < 30 * 60_000;
  const changedCampaign =
    new URL(url).searchParams.has("utm_source") &&
    incoming &&
    previous &&
    (incoming.source !== previous.source ||
      incoming.medium !== previous.medium ||
      incoming.campaign !== previous.campaign);
  if (fresh && !changedCampaign)
    return { visit: { ...previous, updatedAt: now }, started: false };
  return {
    visit: {
      ...(incoming ?? {
        source: "direct",
        medium: "none",
        campaign: "untagged",
      }),
      landing: new URL(url).pathname,
      updatedAt: now,
      visibleSeconds: 0,
      events: [],
    },
    started: true,
  };
}
export function campaignUrl(
  path: string,
  source: string,
  campaign: string,
  campaigns: readonly string[],
) {
  const url = new URL(path, "https://lavik.dev");
  if (
    url.origin !== "https://lavik.dev" ||
    !/^\/(en|zh-CN)\//.test(url.pathname)
  )
    throw new Error("Campaign links must point to a localized Lavik page");
  if (
    !(campaignSources as readonly string[]).includes(source) ||
    !/^[a-z0-9][a-z0-9-]{0,89}$/.test(campaign) ||
    !campaigns.includes(campaign)
  )
    throw new Error("Invalid campaign source or ID");
  url.search = "";
  url.searchParams.set("utm_source", source);
  url.searchParams.set(
    "utm_medium",
    source === "newsletter"
      ? "email"
      : ["medium", "github"].includes(source)
        ? "referral"
        : "social",
  );
  url.searchParams.set("utm_campaign", campaign);
  return url.href;
}
