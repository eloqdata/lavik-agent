import { BenchmarksHome } from "../../../../components/benchmark-reports";
import { StructuredData } from "../../../../components/structured-data";
import {
  pageMetadata,
  pageStructuredData,
} from "../../../../../../packages/seo/site";
import { localeSchema } from "../../../../../../packages/content/schema";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return pageMetadata(localeSchema.parse((await params).locale), "benchmarks");
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = localeSchema.parse((await params).locale);
  return (
    <>
      <StructuredData data={pageStructuredData(locale, "benchmarks")} />
      <BenchmarksHome locale={locale} />
    </>
  );
}
