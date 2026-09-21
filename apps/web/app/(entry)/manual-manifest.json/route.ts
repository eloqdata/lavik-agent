import { requireReviewedManual } from "../../../../../packages/manual/gate";
import { manualRoutes } from "../../../../../packages/manual/repository";
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
  });
}
