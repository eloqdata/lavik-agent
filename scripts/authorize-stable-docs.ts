// Records the owner's explicit instruction. This is not a model-review receipt.
import fs from "node:fs";
import {
  manualContentFileHashes,
  manualPublication,
  manualPublicationErrors,
} from "../packages/manual/gate.ts";
import { stableDocumentationErrors } from "../packages/docs/gate.ts";
import {
  authorizationBundleHash,
  ownerAuthorizationPath,
  ownerInstruction,
  stableDocumentationHashes,
} from "../packages/docs/authorization.ts";

if (!process.argv.includes("--owner-requested-skip"))
  throw new Error(
    "Use only after an explicit owner instruction to skip the additional review",
  );
const errors = [
  ...manualPublicationErrors({ requireReview: false }),
  ...stableDocumentationErrors({ requireAuthorization: false }),
];
if (errors.length) throw new Error(errors.join("\n"));
const manualFiles = manualContentFileHashes(),
  files = stableDocumentationHashes();
fs.writeFileSync(
  ownerAuthorizationPath,
  JSON.stringify(
    {
      authority: "repository-owner",
      decision: "publish-without-additional-model-review",
      instruction: ownerInstruction,
      authorizedAt: "2026-10-13",
      scope:
        "0.1.0 versioned Docs, Download, release notes, and the pending 0.1.0 artifact verification correction. Runtime evidence and CI remain required. No additional model review was run.",
      previousReviewBundleHash: manualPublication().bundleHash,
      manualFiles,
      files,
      bundleHash: authorizationBundleHash({ ...manualFiles, ...files }),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Recorded scoped owner-authorized publication; retained historical model review unchanged.",
);
