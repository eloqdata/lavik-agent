import { notFound } from "next/navigation";
import { ComparisonPage } from "../../../../../components/comparisons";
import { StructuredData } from "../../../../../components/structured-data";
import {
  pageMetadata,
  pageStructuredData,
} from "../../../../../../../packages/seo/site";
import { localeSchema } from "../../../../../../../packages/content/schema";
import {
  comparisonProducts,
  comparisonForRoute,
} from "../../../../../../../packages/comparisons/catalog";
export const dynamicParams = false;
export function generateStaticParams() {
  return comparisonProducts.map((p) => ({ product: `lavik-vs-${p.id}` }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; product: string }>;
}) {
  const p = await params;
  return pageMetadata(localeSchema.parse(p.locale), `compare/${p.product}`);
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; product: string }>;
}) {
  const p = await params,
    locale = localeSchema.parse(p.locale),
    route = `compare/${p.product}`,
    product = comparisonForRoute(route);
  if (!product) notFound();
  return (
    <>
      <StructuredData data={pageStructuredData(locale, route)} />
      <ComparisonPage locale={locale} product={product} />
    </>
  );
}
