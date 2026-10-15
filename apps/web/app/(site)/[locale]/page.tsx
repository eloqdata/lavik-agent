import { pageMetadata } from "../../../../../packages/seo/site";
import { localeSchema } from "../../../../../packages/content/schema";
import {
  homepageBenchmark,
  homepageBenchmarkRows,
} from "../../../../../packages/benchmarks/homepage";
import { estimateCost } from "../../../../../packages/content/economics";
import { Homepage } from "../../../components/homepage";
import { HomepageMotion } from "../../../components/homepage-motion";

// Compare the value-capacity tier; index memory and shared server costs are separate.
const capacityCost = estimateCost({
  dramPerGiB: 20,
  ssdPerGiB: 1,
  datasetGiB: 1,
  indexFraction: 0,
  storageAmplification: 1,
  sharedCost: 0,
});
const capacityRatio = capacityCost.capacityRatio.toFixed(0);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return pageMetadata(localeSchema.parse((await params).locale), "");
}
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = localeSchema.parse((await params).locale);
  const rows = homepageBenchmarkRows;
  return (
    <HomepageMotion>
      <Homepage
        locale={locale}
        rows={rows}
        capacityRatio={capacityRatio}
        sourceUrl={homepageBenchmark.sourceUrl}
        benchmarkDate={homepageBenchmark.date}
        benchmarkScope={homepageBenchmark.scope[locale]}
      />
    </HomepageMotion>
  );
}
