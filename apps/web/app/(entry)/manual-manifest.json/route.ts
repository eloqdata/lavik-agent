import { stableReleaseFor } from "../../../../../packages/docs/stable";
import {
  defaultDocVersion,
  stableDocVersions,
} from "../../../../../packages/docs/versions";
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
  const old = requireStableDocs("0.1.0");
  return Response.json({
    version: defaultDocVersion,
    defaultVersion: defaultDocVersion,
    release: stableRelease.release,
    sourceCommit: stableRelease.commit,
    bundleHash: stable.bundleHash,
    reviewScope: "independent-release-review",
    reviewPolicy:
      "0.2.0 documentation independently reviewed; historical approvals and execution evidence retained.",
    versions: {
      ...Object.fromEntries(
        stableDocVersions.map((version) => {
          const release = stableReleaseFor(version),
            record = version === "0.1.0" ? old : stable;
          return [
            version,
            {
              release: release.release,
              sourceCommit: release.commit,
              bundleHash: record.bundleHash,
              routes: stableManualRoutes(version).length * 2,
            },
          ];
        }),
      ),
      "0.1.0-beta.1": {
        release: publication.release,
        sourceCommit: publication.sourceCommit,
        bundleHash: publication.bundleHash,
        routes: manualRoutes().length * 2,
      },
    },
    contentBundleHash: manualBundleHash(manualContentFileHashes()),
    routes: stableManualRoutes(defaultDocVersion).length * 2,
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
