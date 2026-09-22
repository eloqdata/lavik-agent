import test from "node:test";
import assert from "node:assert/strict";
import { articles, contentHash } from "../packages/content/repository.ts";
import { articleSchema } from "../packages/content/schema.ts";
import { validateArticle } from "../packages/content/gate.ts";
import { blogPresentation } from "../packages/blog/presentation.ts";
import { blogCoverSvg } from "../packages/blog/cover.ts";
import { blogTopics } from "../packages/blog/topics.ts";
import { validatePublication } from "../packages/admin/publish.ts";
import { artifactHash } from "../packages/admin/artifact-id.ts";
import { publicationResult } from "./publication-fixture.ts";
import {
  GET,
  generateStaticParams,
} from "../apps/web/app/(entry)/blog-covers/[file]/route.ts";

test("every existing blog has a unique cover shared by both language editions", async () => {
  const posts = articles().filter((a) => a.kind === "blog");
  assert.equal(posts.length, 20);
  assert.equal(generateStaticParams().length, 10);
  const covers = new Set<string>();
  for (const article of posts.filter((a) => a.locale === "en")) {
    const presentation = blogPresentation(article);
    const translation = posts.find(
      (a) => a.id === article.id && a.locale === "zh-CN",
    )!;
    assert.deepEqual(presentation, blogPresentation(translation));
    const response = await GET(
      new Request(`https://lavik.dev${presentation.cover}`),
      { params: Promise.resolve({ file: `${article.id}.svg` }) },
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /^image\/svg\+xml/);
    const svg = await response.text();
    assert.match(svg, /viewBox="0 0 1200 450"/);
    assert.doesNotMatch(
      svg,
      /<(?:script|image|foreignObject)\b|href=|onload=/i,
    );
    covers.add(svg);
  }
  assert.equal(covers.size, 10);
  assert.equal(
    (
      await GET(new Request("https://lavik.dev/blog-covers/missing.svg"), {
        params: Promise.resolve({ file: "missing.svg" }),
      })
    ).status,
    404,
  );
});

test("new blog topics generate covers automatically and invalid classification fails validation", () => {
  const article = structuredClone(
    articles().find((a) => a.id === "reading-benchmarks" && a.locale === "en")!,
  );
  article.id = article.slug = "a-future-post";
  assert.ok(
    validateArticle(article).some((error) =>
      error.includes("needs at least one topic"),
    ),
  );
  for (const topic of blogTopics) {
    article.topics = [topic.id];
    assert.deepEqual(validateArticle(article), []);
    const presentation = blogPresentation(article);
    assert.equal(presentation.cover, "/blog-covers/a-future-post.svg");
    const svg = blogCoverSvg(article.id, presentation.motif);
    assert.equal(svg, blogCoverSvg(article.id, presentation.motif));
    assert.notEqual(svg, blogCoverSvg("another-post", presentation.motif));
  }
  article.topics = ["benchmark", "benchmark"];
  assert.ok(validateArticle(article).includes("Blog topics must be unique"));
  assert.equal(
    articleSchema.safeParse({ ...article, topics: ["made-up"] }).success,
    false,
  );
  article.topics = ["benchmark"];
  article.kind = "docs";
  assert.ok(
    validateArticle(article).includes("Topics are reserved for blog articles"),
  );
});

test("publication accepts a new classified blog and rejects mismatched bilingual topics", async () => {
  const id = crypto.randomUUID();
  const result = publicationResult(id);
  for (const edition of result.editions) {
    edition.article.kind = "blog";
    edition.article.topics = ["news"];
    edition.contentHash = contentHash(edition.article);
  }
  const task = { id, role: "blog-writer" as const, result };
  await validatePublication(task, await artifactHash(result));
  result.editions[1].article.topics = ["architecture"];
  result.editions[1].contentHash = contentHash(result.editions[1].article);
  await assert.rejects(
    validatePublication(task, await artifactHash(result)),
    /translations must share topics/,
  );
});
