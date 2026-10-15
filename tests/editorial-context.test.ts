import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { articles, readText } from "../packages/content/repository";
import { editorialContextErrors } from "../packages/content/context-review";
const article = articles().find(
  (a) => a.locale === "en" && a.id === "inside-lavik-request-path",
)!;
const approval = () =>
  JSON.parse(readText(`evidence/reviews/en-${article.id}.json`));
test("inherited article approval requires its original content and incremental review lineage", () => {
  const review = approval();
  assert.equal(review.editorialContextRequired, true);
  assert.deepEqual(editorialContextErrors(article, review), []);
  assert.ok(
    editorialContextErrors(
      { ...article, summary: article.summary + " Changed." },
      review,
    ).length,
  );
  assert.ok(
    editorialContextErrors(article, { ...review, contextRefresh: undefined })
      .length,
  );
  assert.ok(
    editorialContextErrors(article, {
      ...review,
      contextRefresh: {
        ...review.contextRefresh,
        previousReviewHash: "0".repeat(64),
      },
    }).length,
  );
});
test("missing or modified editorial audit records cannot retain a passing inherited approval", (t) => {
  const review = approval(),
    read = fs.readFileSync.bind(fs);
  let missing = false;
  t.mock.method(fs, "readFileSync", ((
    file: fs.PathOrFileDescriptor,
    ...args: unknown[]
  ) => {
    if (String(file).endsWith(review.contextRefresh.record)) {
      if (missing) throw new Error("missing audit");
      return String(Reflect.apply(read, fs, [file, ...args])) + " ";
    }
    return Reflect.apply(read, fs, [file, ...args]);
  }) as typeof fs.readFileSync);
  assert.ok(editorialContextErrors(article, review).length);
  missing = true;
  assert.ok(editorialContextErrors(article, review).length);
});
test("removing both optional lineage fields does not bypass the independent inventory", () => {
  const review = approval();
  delete review.editorialContextRequired;
  delete review.contextRefresh;
  assert.ok(editorialContextErrors(article, review).length);
});
test("revised editions require their actual editorial review, exact content and sources", () => {
  const current = articles().find(
    (a) => a.locale === "en" && a.id === "lavik-0-1-0-released",
  )!;
  const review = JSON.parse(readText(`evidence/reviews/en-${current.id}.json`));
  assert.deepEqual(editorialContextErrors(current, review), []);
  const missing = { ...review };
  delete missing.editorialReview;
  assert.ok(editorialContextErrors(current, missing).length);
  assert.ok(
    editorialContextErrors(current, {
      ...review,
      editorialReview: {
        ...review.editorialReview,
        recordSha256: "0".repeat(64),
      },
    }).length,
  );
});

test("renderer downgrades and substituted immutable identities cannot bypass editorial approval", () => {
  const review = approval();
  assert.ok(
    editorialContextErrors(article, { ...review, rendererVersion: 1 }).length,
  );
  assert.ok(
    editorialContextErrors(article, {
      ...review,
      publicationId: "00000000-0000-4000-8000-000000000000",
    }).length,
  );
  assert.ok(
    editorialContextErrors(article, { ...review, artifactHash: "0".repeat(64) })
      .length,
  );
  const current = articles().find(
    (a) => a.locale === "en" && a.id === "lavik-0-1-0-released",
  )!;
  const revised = JSON.parse(
    readText(`evidence/reviews/en-${current.id}.json`),
  );
  assert.ok(
    editorialContextErrors(current, { ...revised, rendererVersion: 1 }).length,
  );
});
