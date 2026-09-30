import { userGuideRoutes } from "../../../../../packages/docs/repository";
import {
  requireReviewedManual,
  manualContentFileHashes,
  manualBundleHash,
} from "../../../../../packages/manual/gate";
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
    reviewScope: "manual-content",
    contentBundleHash: manualBundleHash(manualContentFileHashes()),
    reviewedAt: publication.reviewedAt,
    routes: manualRoutes().length * 2,
    userGuides: ["en", "zh-CN"].flatMap((locale) =>
      userGuideRoutes().map((route) => `/${locale}/${route}/`),
    ),
    operatorGuides: ["en", "zh-CN"].flatMap((locale) =>
      operationsRoutes().map((route) => `/${locale}/${route}/`),
    ),
  });
}
