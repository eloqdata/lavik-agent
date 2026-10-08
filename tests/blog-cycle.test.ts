import assert from "node:assert/strict";
import test from "node:test";
import {
  runBlogRevisionCycle,
  reviewSavedBlogDraft,
} from "../packages/marketing/blog-cycle.ts";
import { validateArticle } from "../packages/content/gate.ts";
import type { Article } from "../packages/content/schema.ts";

const invalid: Article = {
  id: "cost-validation-example",
  slug: "cost-validation-example",
  kind: "blog",
  locale: "en",
  version: "0.1.0",
  updatedAt: "2026-10-05",
  title: "Capacity assumptions",
  summary: "20× is a capacity-cost calculation.",
  topics: ["architecture"],
  blocks: [
    {
      type: "paragraph",
      text: "The capacity comparison depends on its stated assumptions.",
      sources: ["tiering-cost"],
    },
  ],
};
const corrected: Article = {
  ...invalid,
  blocks: [
    ...invalid.blocks,
    { type: "calculation", calculationId: "capacity-economics" },
  ],
};

test("real cost validation feeds the bounded correction before independent review", async () => {
  const events: string[] = [];
  let writes = 0;
  const result = await runBlogRevisionCycle({
    rounds: 2,
    drafts: invalid,
    write: async (drafts, feedback) => {
      events.push("write");
      if (++writes === 2) {
        assert.deepEqual(drafts, invalid);
        assert.match(feedback, /calculation block with explicit assumptions/);
      }
      return {
        drafts: writes === 1 ? invalid : corrected,
        receipt: `writer-${writes}`,
      };
    },
    validate: validateArticle,
    checkpoint: async (_, errors) => {
      events.push(errors.length ? "checkpoint-invalid" : "checkpoint-valid");
    },
    review: async (drafts) => {
      events.push("review");
      assert.deepEqual(drafts, corrected);
      return { passed: true, feedback: "", receipt: "fresh-review" };
    },
  });
  assert.deepEqual(events, [
    "write",
    "checkpoint-invalid",
    "write",
    "checkpoint-valid",
    "review",
  ]);
  assert.equal(result.writer, "writer-2");
  assert.equal(result.reviewer, "fresh-review");
});

test("two invalid drafts exhaust the budget without a reviewer or publication", async () => {
  let writes = 0,
    checkpoints = 0;
  await assert.rejects(
    runBlogRevisionCycle({
      rounds: 2,
      drafts: invalid,
      write: async () => ({ drafts: invalid, receipt: ++writes }),
      validate: validateArticle,
      checkpoint: async () => {
        checkpoints++;
      },
      review: async () => {
        throw new Error("Must not review invalid content");
      },
    }),
    /after the bounded attempts.*calculation block/s,
  );
  assert.equal(writes, 2);
  assert.equal(checkpoints, 2);
});

test("independent reviewer findings use the same correction budget", async () => {
  let writes = 0,
    reviews = 0;
  await assert.rejects(
    runBlogRevisionCycle({
      rounds: 2,
      drafts: corrected,
      write: async (_, feedback) => {
        if (++writes === 2) assert.equal(feedback, "Clarify benchmark scope");
        return { drafts: corrected, receipt: writes };
      },
      validate: validateArticle,
      checkpoint: async () => {},
      review: async () => ({
        passed: false,
        feedback: "Clarify benchmark scope",
        receipt: ++reviews,
      }),
    }),
    /Clarify benchmark scope/,
  );
  assert.equal(writes, 2);
  assert.equal(reviews, 2);
});

test("resumption uses one remaining correction and a fresh independent review", async () => {
  let writes = 0,
    reviews = 0;
  await runBlogRevisionCycle({
    rounds: 1,
    drafts: invalid,
    feedback: "Repair saved draft",
    write: async (drafts, feedback) => {
      writes++;
      assert.deepEqual(drafts, invalid);
      assert.equal(feedback, "Repair saved draft");
      return { drafts: corrected, receipt: "writer-2" };
    },
    validate: validateArticle,
    checkpoint: async () => {},
    review: async () => ({ passed: true, feedback: "", receipt: ++reviews }),
  });
  assert.equal(writes, 1);
  assert.equal(reviews, 1);
});

test("provider failures propagate without an automatic model retry", async () => {
  let writes = 0;
  await assert.rejects(
    runBlogRevisionCycle({
      rounds: 2,
      drafts: invalid,
      write: async () => {
        writes++;
        throw new Error("Authentication unavailable");
      },
      validate: validateArticle,
      checkpoint: async () => {},
      review: async () => {
        throw new Error("Must not review");
      },
    }),
    /Authentication unavailable/,
  );
  assert.equal(writes, 1);
});

test("review-only recovery preserves the exact saved draft and original writer receipt", async () => {
  let reviews = 0;
  const original = JSON.stringify(corrected);
  const writer = { outputSha256: "original-writer-hash" };
  const result = await reviewSavedBlogDraft({
    drafts: corrected,
    writer,
    validate: validateArticle,
    review: async (drafts) => {
      reviews++;
      assert.equal(JSON.stringify(drafts), original);
      return { passed: true, feedback: "", receipt: "reviewer-2" };
    },
  });
  assert.equal(reviews, 1);
  assert.equal(result.writer, writer);
  assert.equal(result.drafts, corrected);
  assert.equal(result.reviewer, "reviewer-2");
});

test("review-only recovery rejects invalid saved drafts before a model call", async () => {
  await assert.rejects(
    reviewSavedBlogDraft({
      drafts: invalid,
      writer: "writer-1",
      validate: validateArticle,
      review: async () => {
        throw new Error("Must not review invalid content");
      },
    }),
    /Saved draft requires correction.*calculation block/s,
  );
});

test("review-only recovery preserves blocking findings without retrying the model", async () => {
  let reviews = 0;
  await assert.rejects(
    reviewSavedBlogDraft({
      drafts: corrected,
      writer: "writer-1",
      validate: validateArticle,
      review: async () => {
        reviews++;
        return {
          passed: false,
          feedback: "Unsupported migration promise",
          receipt: "reviewer-2",
        };
      },
    }),
    /Unsupported migration promise/,
  );
  assert.equal(reviews, 1);
});

test("review-only recovery propagates provider failures without retry or fallback", async () => {
  let reviews = 0;
  await assert.rejects(
    reviewSavedBlogDraft({
      drafts: corrected,
      writer: "writer-1",
      validate: validateArticle,
      review: async () => {
        reviews++;
        throw new Error("Selected model is at capacity");
      },
    }),
    /Selected model is at capacity/,
  );
  assert.equal(reviews, 1);
});
