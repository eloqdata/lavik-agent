import { requireReviewedManual } from "../../../../../packages/manual/gate";
import { manualRoutes } from "../../../../../packages/manual/repository";
import { operationsRoutes } from "../../../../../packages/operations/repository";
export const dynamic = "force-static";
export function GET() {
  const publication = requireReviewedManual();
  return Response.json({
    version: publication.version,
    release: publication.release,
    sourceCommit: publication.sourceCommit,
    bundleHash: publication.bundleHash,
    reviewedAt: publication.reviewedAt,
    routes: manualRoutes().length * 2,
    operatorGuides: ["en", "zh-CN"].flatMap((locale) =>
      operationsRoutes().map((route) => `/${locale}/${route}/`),
    ),
  });
}
