import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  docVersions,
  defaultDocVersion,
  docVersionForRoute,
  downloadPath,
} from "../packages/docs/versions.ts";
import {
  stableRelease,
  stablePackages,
  stableCases,
  stableGuideRoutes,
  stableManualRoutes,
} from "../packages/docs/stable.ts";
import {
  release,
  articles,
  articlePath,
} from "../packages/content/repository.ts";
import { downloadPackages } from "../packages/content/downloads.ts";
import { manualCases, manualRoutes } from "../packages/manual/repository.ts";
import { stableDocumentationErrors } from "../packages/docs/gate.ts";
import {
  ownerAuthorization,
  ownerAcceptsManualChanges,
} from "../packages/docs/authorization.ts";
import { pageMetadata } from "../packages/seo/site.ts";

test("stable docs/download are defaults; historical release and benchmark locks remain beta", () => {
  assert.equal(defaultDocVersion, "0.1.0");
  assert.deepEqual(docVersions, ["0.1.0", "0.1.0-beta.1"]);
  assert.equal(docVersionForRoute("docs"), "0.1.0");
  assert.equal(
    docVersionForRoute("docs/0.1.0-beta.1/commands/get"),
    "0.1.0-beta.1",
  );
  assert.equal(docVersionForRoute("docs/unknown"), undefined);
  assert.equal(downloadPath("en", "0.1.0"), "/en/download/");
  assert.equal(
    downloadPath("en", "0.1.0-beta.1"),
    "/en/download/0.1.0-beta.1/",
  );
  assert.equal(
    stableRelease.commit,
    "feb61224e414c5653fd09560e20c9d214db1e3ac",
  );
  assert.equal(release.release, "0.1.0-beta.1");
  assert.equal(stablePackages().length, 4);
  assert.ok(
    stablePackages().every(
      (pkg) => pkg.url.includes("/v0.1.0/") && !pkg.url.includes("beta"),
    ),
  );
  assert.ok(
    downloadPackages.every((pkg) => pkg.url.includes("/v0.1.0-beta.1/")),
  );
});
test("both command inventories and corresponding routes are preserved independently", () => {
  assert.equal(manualCases().length, 217);
  assert.equal(stableCases().length, 218);
  assert.ok(stableCases().some((c) => c.name === "LAVIK.REPLICAOF"));
  assert.ok(
    manualRoutes().every((route) => route.startsWith("docs/0.1.0-beta.1/")),
  );
  assert.ok(
    stableManualRoutes().every((route) => route.startsWith("docs/0.1.0/")),
  );
  const routes = [
    ...manualRoutes(),
    ...stableManualRoutes(),
    ...stableGuideRoutes(),
  ];
  assert.equal(new Set(routes).size, routes.length);
  assert.ok(
    articles()
      .filter((a) => a.kind === "docs")
      .every((a) => articlePath(a).includes("/docs/0.1.0-beta.1/")),
  );
});
test("versioned documentation has distinct canonical URLs and correct download metadata", () => {
  for (const locale of ["en", "zh-CN"] as const)
    for (const version of docVersions) {
      const route = `docs/${version}/commands/get`;
      assert.equal(
        pageMetadata(locale, route).alternates?.canonical,
        `https://lavik.dev/${locale}/${route}/`,
      );
      assert.match(
        String(pageMetadata(locale, route).title),
        new RegExp(version.replaceAll(".", "\\.")),
      );
    }
  assert.ok(!pageMetadata("en", "download").description?.includes("beta.1"));
  assert.ok(
    pageMetadata("en", "download/0.1.0-beta.1").description?.includes("beta.1"),
  );
});
test("stable documentation retains successful release-matched runtime evidence", () => {
  assert.deepEqual(stableDocumentationErrors(), []);
});
test("owner waiver is scoped to exact prepared bytes and the historical review", () => {
  const record = ownerAuthorization();
  assert.equal(record.decision, "publish-without-additional-model-review");
  assert.ok(
    ownerAcceptsManualChanges(
      record.manualFiles,
      record.previousReviewBundleHash,
    ),
  );
  assert.ok(
    !ownerAcceptsManualChanges(
      {
        ...record.manualFiles,
        "packages/manual/repository.ts": "0".repeat(64),
      },
      record.previousReviewBundleHash,
    ),
  );
  assert.ok(!ownerAcceptsManualChanges(record.manualFiles, "0".repeat(64)));
});
test("a stable receipt cannot claim a fabricated reply as passed", (t) => {
  const original = fs.readFileSync.bind(fs);
  t.mock.method(fs, "readFileSync", ((
    file: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) => {
    const result = Reflect.apply(original, fs, [file, ...args]);
    if (String(file).endsWith("evidence/docs/0.1.0/commands.json")) {
      const report = JSON.parse(String(result));
      report.commands
        .find((c: { name: string }) => c.name === "GET")
        .steps.at(-1).actual = "fabricated";
      return JSON.stringify(report);
    }
    return result;
  }) as typeof fs.readFileSync);
  assert.ok(
    stableDocumentationErrors().some((error) => error.includes("GET: step")),
  );
});
