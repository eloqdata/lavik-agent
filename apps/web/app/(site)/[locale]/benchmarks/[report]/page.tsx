import { notFound } from "next/navigation";
import { BenchmarkReportPage } from "../../../../../components/benchmark-reports";
import { StructuredData } from "../../../../../components/structured-data";
import {
  pageMetadata,
  pageStructuredData,
} from "../../../../../../../packages/seo/site";
import { localeSchema } from "../../../../../../../packages/content/schema";
import {
  benchmarkReports,
  benchmarkRoute,
} from "../../../../../../../packages/benchmarks/catalog";
export const dynamicParams = false;
export function generateStaticParams() {
  return benchmarkReports.map((r) => ({ report: r.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; report: string }>;
}) {
  const p = await params;
  return pageMetadata(localeSchema.parse(p.locale), benchmarkRoute(p.report));
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; report: string }>;
}) {
  const p = await params,
    locale = localeSchema.parse(p.locale),
    report = benchmarkReports.find((r) => r.id === p.report);
  if (!report) notFound();
  return (
    <>
      <StructuredData
        data={pageStructuredData(locale, benchmarkRoute(report.id))}
      />
      <BenchmarkReportPage locale={locale} report={report} />
    </>
  );
}
