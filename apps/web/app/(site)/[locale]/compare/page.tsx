import { CompareHome } from "../../../../components/comparisons";
import { StructuredData } from "../../../../components/structured-data";
import {
  pageMetadata,
  pageStructuredData,
} from "../../../../../../packages/seo/site";
import { localeSchema } from "../../../../../../packages/content/schema";
export function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return params.then(({ locale }) =>
    pageMetadata(localeSchema.parse(locale), "compare"),
  );
}
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = localeSchema.parse((await params).locale);
  return (
    <>
      <StructuredData data={pageStructuredData(locale, "compare")} />
      <CompareHome locale={locale} />
    </>
  );
}
