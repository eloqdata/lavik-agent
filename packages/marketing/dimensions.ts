import type { AnalyticsEvent } from "./analytics";
import { safeCampaign } from "./attribution";
type Assets = { fetch(request: Request): Promise<Response> };
type Registry = { paths: Set<string>; campaigns: string[]; at: number };
const cache = new WeakMap<Assets, Registry>();
export async function publicDimensions(assets: Assets, event: AnalyticsEvent) {
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
    ])) as [{ pages: Record<string, string> }, { articles: { id: string }[] }];
    if (!manifest.pages || !Array.isArray(links.articles))
      throw new Error("Invalid public attribution registry");
    registry = {
      paths: new Set(
        Object.keys(manifest.pages).map((url) => new URL(url).pathname),
      ),
      campaigns: links.articles.map((a) => a.id),
      at: Date.now(),
    };
    cache.set(assets, registry);
  }
  if (!registry.paths.has(event.path)) return null;
  return {
    ...event,
    campaign: safeCampaign(event.campaign, registry.campaigns),
  };
}
