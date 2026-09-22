import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  runCampaign,
  campaignPath,
  type AgentRuntime,
} from "../packages/agents/workflow.ts";
import { publishCampaign } from "../packages/agents/publish.ts";
import { articles, root } from "../packages/content/repository.ts";
import { storedReceipt } from "../packages/content/gate.ts";

const id = () => `test-${randomUUID()}`;
const runtime = (
  rejectFirst = false,
): AgentRuntime & { writes: number; reviews: number } => ({
  identity: "test-runtime",
  writes: 0,
  reviews: 0,
  async write({ locale, feedback }) {
    this.writes++;
    if (rejectFirst && this.writes === 2)
      assert.deepEqual(feedback, ["Clarify the audience"]);
    const article = structuredClone(
      articles().find((a) => a.locale === locale)!,
    );
    article.kind = "blog";
    article.topics = ["architecture"];
    article.blocks = [
      {
        type: "paragraph",
        text:
          locale === "en"
            ? "Lavik stores values on storage."
            : "Lavik 将值存储在存储设备上。",
        sources: ["readme"],
      },
    ];
    return article;
  },
  async review() {
    this.reviews++;
    return {
      verdict: rejectFirst && this.reviews === 1 ? "revise" : "pass",
      findings:
        rejectFirst && this.reviews === 1 ? ["Clarify the audience"] : [],
      checkedSourceIds: ["readme"],
    };
  },
});
test("review feedback drives revision, both languages complete, resume skips finished work", async () => {
  const campaign = id(),
    model = runtime(true);
  try {
    const state = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      async () => storedReceipt("basic-commands"),
    );
    assert.equal(state.status, "ready");
    assert.equal(model.writes, 3);
    assert.equal(state.attempts.en, 2);
    assert.equal(state.attempts["zh-CN"], 1);
    await runCampaign(campaign, "Explain capacity", model, async () => {
      throw new Error("must not rerun");
    });
    assert.equal(model.writes, 3);
    await assert.rejects(
      runCampaign(campaign, "Different brief", model, async () =>
        storedReceipt("basic-commands"),
      ),
      /inputs changed/,
    );
  } finally {
    await fs.rm(campaignPath(campaign), { recursive: true, force: true });
  }
});
test("a failed reviewer resumes the checkpointed draft after the final writing attempt", async () => {
  const campaign = id(),
    model = runtime();
  const write = model.write.bind(model),
    review = model.review.bind(model);
  let reviewCalls = 0,
    verifierCalls = 0;
  model.write = async (input, verify) => {
    const article = await write(input, verify);
    article.blocks.push({ type: "recipe", recipeId: "basic-commands" });
    return article;
  };
  model.review = async (article, receipts) => {
    reviewCalls++;
    if (reviewCalls <= 2)
      return {
        verdict: "revise",
        findings: ["Tighten wording"],
        checkedSourceIds: ["readme"],
      };
    if (reviewCalls === 3) throw new Error("Reviewer temporarily unavailable");
    return review(article, receipts);
  };
  const verify = async () => {
    verifierCalls++;
    return storedReceipt("basic-commands");
  };
  try {
    const failed = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      verify,
    );
    assert.equal(failed.status, "blocked");
    assert.equal(failed.attempts.en, 3);
    assert.equal(failed.editions.en?.reviewPending, true);
    assert.equal(failed.editions.en?.receipts[0].status, "passed");
    assert.equal(model.writes, 3);
    await assert.rejects(publishCampaign(campaign), /not ready/);
    const resumed = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      verify,
    );
    assert.equal(resumed.status, "ready");
    assert.equal(resumed.attempts.en, 3);
    assert.equal(
      resumed.editions.en?.contentHash,
      failed.editions.en?.contentHash,
    );
    assert.equal(resumed.editions.en?.reviewPending, false);
    // Only the Chinese edition requires another write and verifier call.
    assert.equal(model.writes, 4);
    assert.equal(verifierCalls, 4);
  } finally {
    await fs.rm(campaignPath(campaign), { recursive: true, force: true });
  }
});

test("writer transport failures preserve revision findings without leaking them to the next language", async () => {
  const campaign = id(),
    model = runtime();
  const write = model.write.bind(model),
    review = model.review.bind(model);
  let writingCalls = 0,
    reviewCalls = 0;
  model.write = async (input, verify) => {
    writingCalls++;
    if (writingCalls === 2) throw new Error("Provider connection failed");
    if (writingCalls === 3) {
      assert.ok(input.feedback.includes("Define the modeled cost boundary"));
      assert.ok(input.feedback.includes("Provider connection failed"));
    }
    if (input.locale === "zh-CN") assert.deepEqual(input.feedback, []);
    return write(input, verify);
  };
  model.review = async (article, receipts) => {
    if (++reviewCalls === 1)
      return {
        verdict: "revise",
        findings: ["Define the modeled cost boundary"],
        checkedSourceIds: ["readme"],
      };
    return review(article, receipts);
  };
  try {
    const first = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      async () => storedReceipt("basic-commands"),
    );
    assert.equal(first.status, "blocked");
    assert.equal(first.attempts.en, 2);
    const resumed = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      async () => storedReceipt("basic-commands"),
    );
    assert.equal(resumed.status, "ready");
    assert.equal(resumed.attempts.en, 3);
    assert.equal(writingCalls, 4);
  } finally {
    await fs.rm(campaignPath(campaign), { recursive: true, force: true });
  }
});

test("real verifier failure blocks publication even if a reviewer would pass", async () => {
  const campaign = id(),
    model = runtime();
  model.write = async ({ locale }) => ({
    ...articles().find((a) => a.locale === locale)!,
    kind: "blog",
    topics: ["architecture"],
    blocks: [{ type: "recipe", recipeId: "basic-commands" }],
  });
  try {
    const state = await runCampaign(
      campaign,
      "Show commands",
      model,
      async () => ({ ...storedReceipt("basic-commands"), status: "failed" }),
    );
    assert.equal(state.status, "blocked");
    assert.equal(model.reviews, 0);
    await assert.rejects(publishCampaign(campaign), /not ready/);
  } finally {
    await fs.rm(campaignPath(campaign), { recursive: true, force: true });
  }
});
test("a pass verdict with uninspected sources or findings is not accepted", async () => {
  const campaign = id(),
    model = runtime();
  model.review = async () => ({
    verdict: "pass",
    findings: [],
    checkedSourceIds: [],
  });
  try {
    const state = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      async () => storedReceipt("basic-commands"),
    );
    assert.equal(state.status, "blocked");
    assert.equal(state.attempts.en, 3);
  } finally {
    await fs.rm(campaignPath(campaign), { recursive: true, force: true });
  }
});
test("automatic publication is bilingual, idempotent, and bound to reviewed content", async () => {
  const campaign = id(),
    model = runtime();
  const publishedFiles = ["en", "zh-CN"].flatMap((locale) => [
    path.join(root, "content", locale, `${campaign}.json`),
    path.join(root, "evidence/reviews", `${locale}-${campaign}.json`),
  ]);
  try {
    const state = await runCampaign(
      campaign,
      "Explain capacity",
      model,
      async () => storedReceipt("basic-commands"),
    );
    state.editions.en!.article.title += " unauthorized edit";
    await fs.writeFile(
      path.join(campaignPath(campaign), "state.json"),
      JSON.stringify(state),
    );
    await assert.rejects(publishCampaign(campaign), /content changed/);
    state.editions.en!.article.title = state.editions.en!.article.title.replace(
      " unauthorized edit",
      "",
    );
    const reviewedRenderingHash = state.editions.en!.renderingHash;
    state.editions.en!.renderingHash = "stale-rendering";
    await fs.writeFile(
      path.join(campaignPath(campaign), "state.json"),
      JSON.stringify(state),
    );
    await assert.rejects(publishCampaign(campaign), /content changed/);
    state.editions.en!.renderingHash = reviewedRenderingHash;
    await fs.writeFile(
      path.join(campaignPath(campaign), "state.json"),
      JSON.stringify(state),
    );
    assert.equal((await publishCampaign(campaign)).status, "published");
    assert.equal((await publishCampaign(campaign)).status, "published");
    for (const file of publishedFiles) assert.ok((await fs.stat(file)).size);
  } finally {
    for (const file of publishedFiles) await fs.rm(file, { force: true });
    await fs.rm(campaignPath(campaign), { recursive: true, force: true });
  }
});
