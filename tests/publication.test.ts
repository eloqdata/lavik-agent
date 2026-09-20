import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { artifactHash } from "../packages/admin/artifact-id.ts";
import {
  preparePublication,
  validatePublication,
  verifyLivePublication,
  type PublicationRecord,
} from "../packages/admin/publish.ts";
import { contentHash } from "../packages/content/repository.ts";
import { root } from "../packages/content/repository.ts";
import { publicationErrors } from "../packages/content/gate.ts";
import { publicationResult } from "./publication-fixture.ts";

function candidate() {
  const id = crypto.randomUUID();
  return { id, role: "manual-writer" as const, result: publicationResult(id) };
}

test("the website gate detects changes to an article's reviewed execution record", async () => {
  const task = candidate();
  const prepared = await preparePublication(
    task,
    await artifactHash(task.result),
  );
  try {
    const article = task.result.editions[0].article;
    assert.deepEqual(publicationErrors(article), []);
    const file = path.join(
      root,
      `evidence/publications/${task.id}/en-basic-commands.json`,
    );
    const receipt = JSON.parse(await fs.readFile(file, "utf8"));
    receipt.platform = "a-different-execution-environment";
    await fs.writeFile(file, JSON.stringify(receipt));
    assert.ok(
      publicationErrors(article).some((error) =>
        error.includes("Reviewed execution record changed"),
      ),
    );
  } finally {
    await Promise.all(
      prepared.files.map((file) =>
        fs.rm(path.join(root, file), { force: true }),
      ),
    );
    await fs.rm(path.join(root, `evidence/publications/${task.id}`), {
      recursive: true,
      force: true,
    });
  }
});

test("publisher writes an immutable bilingual artifact without private inputs or shared receipt replacement", async () => {
  const task = candidate(),
    digest = await artifactHash(task.result);
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "lavik-publication-"),
  );
  try {
    const first = await preparePublication(task, digest, directory);
    const second = await preparePublication(task, digest, directory);
    assert.deepEqual(first, second);
    assert.equal(first.record.editions.length, 2);
    assert.ok(
      first.files.every(
        (file) => file.startsWith("content/") || file.startsWith("evidence/"),
      ),
    );
    assert.ok(
      !first.files.some((file) => file.startsWith("evidence/verification/")),
    );
    for (const file of first.files) {
      const saved = await fs.readFile(path.join(directory, file), "utf8");
      assert.doesNotMatch(saved, /test-private-endpoint-do-not-publish/);
    }
    const receipt = path.join(
      directory,
      `evidence/publications/${task.id}/en-basic-commands.json`,
    );
    await fs.writeFile(receipt, "{}");
    await assert.rejects(
      preparePublication(task, digest, directory),
      /immutable/,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("publisher rejects changed artifacts, failed review, missing evidence and stale context before writing", async () => {
  const task = candidate();
  const digest = await artifactHash(task.result);
  const changed = structuredClone(task);
  changed.result.editions[0].article.summary += " Changed.";
  await assert.rejects(
    validatePublication(changed, digest),
    /artifact changed/,
  );
  for (const [mutate, reason] of [
    [
      (t: ReturnType<typeof candidate>) => {
        t.result.editions[0].review.findings = ["Unresolved finding"];
      },
      /unresolved findings/,
    ],
    [
      (t: ReturnType<typeof candidate>) => {
        t.result.editions[0].receipts = [];
      },
      /evidence failed/,
    ],
    [
      (t: ReturnType<typeof candidate>) => {
        t.result.editions[0].review.checkedSourceIds = [];
      },
      /every cited source/,
    ],
    [
      (t: ReturnType<typeof candidate>) => {
        t.result.editions[0].renderingHash = "stale";
      },
      /rendering changed/,
    ],
    [
      (t: ReturnType<typeof candidate>) => {
        t.result.publicationContext!.policyHash = "0".repeat(64);
      },
      /policy changed/,
    ],
    [
      (t: ReturnType<typeof candidate>) => {
        delete t.result.publicationContext;
      },
      /predates/,
    ],
    [
      (t: ReturnType<typeof candidate>) => {
        t.result.editions = [t.result.editions[0]];
      },
      /Both reviewed/,
    ],
  ] as const) {
    const value = structuredClone(task);
    mutate(value);
    await assert.rejects(
      validatePublication(value, await artifactHash(value.result)),
      reason,
    );
  }
});

test("publisher detects a destination edit made after the writer's snapshot", async () => {
  const task = candidate();
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "lavik-publication-conflict-"),
  );
  try {
    const target = path.join(
      directory,
      `content/en/${task.result.editions[0].article.id}.json`,
    );
    await fs.mkdir(path.dirname(target), { recursive: true });
    const original = structuredClone(task.result.editions[0].article);
    task.result.publicationContext!.baseContentHashes.en =
      contentHash(original);
    const edited = { ...original, title: "A newer owner's edit" };
    await fs.writeFile(target, JSON.stringify(edited));
    await assert.rejects(
      preparePublication(task, await artifactHash(task.result), directory),
      /destination changed/,
    );
    assert.deepEqual(JSON.parse(await fs.readFile(target, "utf8")), edited);
    assert.equal(
      await fs
        .stat(path.join(directory, "evidence"))
        .then(() => true)
        .catch(() => false),
      false,
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("Published requires the exact deployed manifest and both live content hashes", async () => {
  const record: PublicationRecord = {
    schemaVersion: 1,
    taskId: crypto.randomUUID(),
    artifactHash: "a".repeat(64),
    editions: [
      {
        locale: "en",
        id: "example",
        contentHash: "b".repeat(64),
        path: "/en/blog/example/",
        receiptHashes: {},
      },
      {
        locale: "zh-CN",
        id: "example",
        contentHash: "c".repeat(64),
        path: "/zh-CN/blog/example/",
        receiptHashes: {},
      },
    ],
  };
  let mode = "correct";
  const http: typeof fetch = async (url, options) => {
    assert.equal(options?.redirect, "manual");
    if (String(url).includes("publication-manifest"))
      return Response.json({
        publications: mode === "manifest" ? [] : [record],
      });
    const edition = record.editions.find((e) => String(url).includes(e.path))!;
    return new Response(
      `<main data-content-hash="${mode === "content" ? "stale" : edition.contentHash}"></main>`,
      { status: mode === "missing" && edition.locale === "zh-CN" ? 404 : 200 },
    );
  };
  for (const invalid of ["manifest", "content", "missing"]) {
    mode = invalid;
    await assert.rejects(verifyLivePublication(record, http), /match/);
  }
  mode = "correct";
  await verifyLivePublication(record, http);
});
