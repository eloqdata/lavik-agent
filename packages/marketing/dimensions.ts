import type { AnalyticsEvent } from "./analytics";
import { safeCampaign } from "./attribution";
type Assets = { fetch(request: Request): Promise<Response> };
export type Registry = {
  paths: Set<string>;
  campaigns: string[];
  articles: { id: string; locale: string; canonical: string; title?: string }[];
  pages: Registry["articles"];
  at: number;
};
const cache = new WeakMap<Assets, Registry>();
export async function publicRegistry(assets: Assets) {
  let registry = cache.get(assets);
  if (!registry || Date.now() - registry.at > 60_000) {
    const read = async (path: string) => {
      const response = await assets.fetch(
        new Request(`https://lavik.dev/${path}`),
      );
      if (!response.ok)
        throw new Error("Public attribution registry unavailable");
      return response.json();
    };
    const [manifest, links] = (await Promise.all([
      read("discovery-manifest.json"),
      read("campaign-links.json"),
    ])) as [
      { pages: Record<string, string> },
      { articles: Registry["articles"]; pages?: Registry["pages"] },
    ];
    if (
      !manifest.pages ||
      !Array.isArray(links.articles) ||
      (links.pages !== undefined && !Array.isArray(links.pages))
    )
      throw new Error("Invalid public attribution registry");
    registry = {
      paths: new Set(
        Object.keys(manifest.pages).map((url) => new URL(url).pathname),
      ),
      campaigns: [
        ...new Set(
          [...links.articles, ...(links.pages ?? [])].map((a) => a.id),
        ),
      ],
      articles: links.articles,
      pages: links.pages ?? [],
      at: Date.now(),
    };
    cache.set(assets, registry);
  }
  return registry;
}
export async function publicDimensions(assets: Assets, event: AnalyticsEvent) {
  const registry = await publicRegistry(assets);
  if (!registry.paths.has(event.path)) return null;
  return {
    ...event,
    campaign: safeCampaign(event.campaign, registry.campaigns),
  };
}
