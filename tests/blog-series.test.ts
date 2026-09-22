import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { articles, claims, sources } from "../packages/content/repository.ts";
import {
  codexInvocationBudget,
  subscriptionEnvironment,
} from "../packages/local/codex.ts";
import {
  validateArticle,
  publicationErrors,
} from "../packages/content/gate.ts";

const revision = "9d6b212da5da820b4bed63fc047b5c2ed6be1fa5";
test("eight engineering articles have paired editions and the exact reviewed source snapshot", () => {
  const series = articles().filter((a) => a.sourceRevision === revision);
  assert.equal(series.length, 16);
  assert.equal(new Set(series.map((a) => a.id)).size, 8);
  for (const article of series) {
    assert.equal(article.kind, "blog");
    assert.deepEqual(publicationErrors(article), [], article.id);
    assert.equal(
      series.filter(
        (other) => other.id === article.id && other.locale !== article.locale,
      ).length,
      1,
    );
    for (const block of article.blocks)
      if (block.type === "paragraph") {
        assert.ok(block.sources.length > 0);
        for (const id of block.sources)
          assert.ok(
            sources
              .find((source) => source.id === id)
              ?.url.includes(`/blob/${revision}/`),
          );
      }
  }
});
test("engineering snapshot metadata cannot silently relabel release docs or cite another revision", () => {
  const article = structuredClone(
    articles().find((a) => a.sourceRevision === revision)!,
  );
  article.kind = "docs";
  assert.ok(
    validateArticle(article).some((error) =>
      error.includes("reserved for engineering"),
    ),
  );
  article.kind = "blog";
  article.sourceRevision = "0".repeat(40);
  assert.ok(
    validateArticle(article).some((error) =>
      error.includes("does not match the article snapshot"),
    ),
  );
});

test("current architecture citations require explicit snapshot labels, including through claims", () => {
  const article = structuredClone(articles()[0]);
  article.topics = ["architecture"];
  delete article.sourceRevision;
  article.kind = "docs";
  article.blocks = [
    {
      type: "paragraph",
      text: "Architecture discussion.",
      sources: ["design-architecture--01-overview"],
    },
  ];
  assert.ok(
    validateArticle(article).some((error) =>
      error.includes("needs an explicit engineering snapshot"),
    ),
  );
  article.kind = "blog";
  assert.ok(
    validateArticle(article).some((error) =>
      error.includes("needs an explicit engineering snapshot"),
    ),
  );
  const claim = claims.find(
    (entry) =>
      entry.status === "supported" && !entry.id.startsWith("benchmark"),
  )!;
  const previousSources = claim.sources;
  try {
    claim.sources = ["design-architecture--01-overview"];
    article.blocks = [{ type: "claim", claimId: claim.id }];
    assert.ok(
      validateArticle(article).some((error) =>
        error.includes("needs an explicit engineering snapshot"),
      ),
    );
    article.sourceRevision = revision;
    assert.deepEqual(validateArticle(article), []);
    claim.sources = ["architecture"];
    assert.ok(
      validateArticle(article).some((error) =>
        error.includes("does not match the article snapshot"),
      ),
    );
    article.blocks = [
      { type: "calculation", calculationId: "capacity-economics" },
    ];
    assert.ok(
      validateArticle(article).some((error) =>
        error.includes("does not match the article snapshot"),
      ),
    );
  } finally {
    claim.sources = previousSources;
  }
  delete article.sourceRevision;
  article.kind = "docs";
  delete article.topics;
  article.blocks = [
    {
      type: "paragraph",
      text: "Historical benchmark with its report scope.",
      sources: ["benchmark-spdk"],
    },
  ];
  assert.deepEqual(validateArticle(article), []);
});

test("source audits cannot bypass renderer freshness", () => {
  const article = articles()[0];
  const file = `evidence/reviews/${article.locale}-${article.id}.json`;
  const original = fs.readFileSync(file);
  try {
    const review = JSON.parse(original.toString());
    review.method = "source-audit";
    for (const renderingHash of [undefined, "stale"]) {
      review.renderingHash = renderingHash;
      fs.writeFileSync(file, JSON.stringify(review));
      assert.ok(
        publicationErrors(article).some((error) =>
          error.includes("changed content rendering"),
        ),
      );
    }
  } finally {
    fs.writeFileSync(file, original);
  }
});

test("incremental review rejects ineligible manual approvals before invoking a model", () => {
  const baseline = JSON.parse(
    fs.readFileSync("evidence/manual/0.1.0/publication.json", "utf8"),
  );
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "lavik-review-baseline-"),
  );
  try {
    for (const field of [
      "version",
      "release",
      "sourceCommit",
      "provider",
      "model",
      "authentication",
    ]) {
      const invalid = structuredClone(baseline);
      if (["provider", "model", "authentication"].includes(field))
        invalid.reviewer[field] = "ineligible";
      else invalid[field] = "ineligible";
      fs.writeFileSync(
        path.join(directory, "manual-before.json"),
        JSON.stringify(invalid),
      );
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            [
              "--import",
              "tsx",
              "scripts/review-blog-batch.ts",
              directory,
              "unused-draft.json",
            ],
            {
              env: subscriptionEnvironment(),
              stdio: "pipe",
            },
          ),
        (error: unknown) =>
          String((error as { stderr: Buffer }).stderr).includes(
            "A valid prior local manual approval is required",
          ),
        field,
      );
      assert.deepEqual(
        fs.readdirSync(directory),
        ["manual-before.json"],
        "No model attempt may be created",
      );
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("local batch follow-up is explicit and bounded without changing default invocation limits", () => {
  assert.deepEqual(codexInvocationBudget("reviewer"), {
    roleLimit: 2,
    totalLimit: 4,
  });
  assert.deepEqual(codexInvocationBudget("reviewer", "Correction"), {
    roleLimit: 3,
    totalLimit: 4,
  });
  assert.deepEqual(
    codexInvocationBudget(
      "reviewer",
      undefined,
      "Final batch infrastructure review",
    ),
    { roleLimit: 4, totalLimit: 5 },
  );
  assert.deepEqual(codexInvocationBudget("reviewer", undefined, " "), {
    roleLimit: 2,
    totalLimit: 4,
  });
  assert.throws(() =>
    codexInvocationBudget("writer", undefined, "More writing"),
  );
  assert.throws(() =>
    codexInvocationBudget("reviewer", undefined, "x".repeat(121)),
  );
});
