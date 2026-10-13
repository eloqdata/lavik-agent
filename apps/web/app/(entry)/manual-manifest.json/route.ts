import { userGuideRoutes } from "../../../../../packages/docs/repository";
import {
  requireReviewedManual,
  manualContentFileHashes,
  manualBundleHash,
} from "../../../../../packages/manual/gate";
import { manualRoutes } from "../../../../../packages/manual/repository";
import { operationsRoutes } from "../../../../../packages/operations/repository";
import { requireStableDocs } from "../../../../../packages/docs/gate";
import {
  stableRelease,
  stableGuideRoutes,
  stableManualRoutes,
} from "../../../../../packages/docs/stable";
export const dynamic = "force-static";
export function GET() {
  const publication = requireReviewedManual();
  const stable = requireStableDocs();
  return Response.json({
    version: "0.1.0",
    defaultVersion: "0.1.0",
    release: stableRelease.release,
    sourceCommit: stableRelease.commit,
    bundleHash: stable.bundleHash,
    reviewScope: "owner-authorized-release-update",
    reviewPolicy:
      "Additional model review skipped at the owner's explicit request; execution evidence and CI required.",
    versions: {
      "0.1.0": {
        release: stableRelease.release,
        sourceCommit: stableRelease.commit,
        bundleHash: stable.bundleHash,
        routes: stableManualRoutes().length * 2,
      },
      "0.1.0-beta.1": {
        release: publication.release,
        sourceCommit: publication.sourceCommit,
        bundleHash: publication.bundleHash,
        routes: manualRoutes().length * 2,
      },
    },
    contentBundleHash: manualBundleHash(manualContentFileHashes()),
    authorizedAt: stable.authorizedAt,
    routes: stableManualRoutes().length * 2,
    userGuides: ["en", "zh-CN"].flatMap((locale) =>
      stableGuideRoutes()
        .filter((route) => !route.includes("/lavik-ctl-"))
        .map((route) => `/${locale}/${route}/`),
    ),
    operatorGuides: ["en", "zh-CN"].flatMap((locale) =>
      stableGuideRoutes()
        .filter((route) => route.includes("/lavik-ctl-"))
        .map((route) => `/${locale}/${route}/`),
    ),
  });
}
