import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  articleSchema,
  claimSchema,
  recipeSchema,
  sourceSchema,
  type Article,
} from "./schema.ts";

function findRoot() {
  let directory = process.cwd();
  while (true) {
    const candidate = path.join(directory, "package.json");
    if (
      fs.existsSync(candidate) &&
      JSON.parse(fs.readFileSync(candidate, "utf8")).name === "lavik-agent"
    )
      return directory;
    const parent = path.dirname(directory);
    if (parent === directory)
      throw new Error("Run from the lavik-agent workspace");
    directory = parent;
  }
}
export const root = findRoot();
export const readText = (file: string) =>
  fs.readFileSync(path.join(root, file), "utf8");
export const readJson = (file: string): unknown => JSON.parse(readText(file));
export const hash = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const contentHash = (article: Article) =>
  hash(JSON.stringify(articleSchema.parse(article)));
export const release = JSON.parse(readText("content/releases/0.1.0.json")) as {
  version: string;
  release: string;
  tag: string;
  commit: string;
  date: string;
  artifacts: Record<string, { url: string; sha256: string; filename: string }>;
  benchmarkCommit: string;
};
export const sources = sourceSchema
  .array()
  .parse(readJson("evidence/sources.json"));
export const claims = claimSchema
  .array()
  .parse(readJson("content/claims.json"));
export const recipes = recipeSchema
  .array()
  .parse(readJson("verification/recipes.json"));
export const knowledgeHash = () =>
  hash(JSON.stringify({ release, sources, claims }));
export const renderingFiles = [
  "apps/web/components/content.tsx",
  "apps/web/components/cost-calculator.tsx",
  "packages/content/economics.ts",
];
export const renderingHash = () =>
  hash(JSON.stringify(renderingFiles.map((file) => [file, readText(file)])));
export function articles(): Article[] {
  return ["en", "zh-CN"].flatMap((locale) =>
    fs
      .readdirSync(path.join(root, "content", locale))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) =>
        articleSchema.parse(readJson(`content/${locale}/${name}`)),
      ),
  );
}
export function articlePath(article: Article) {
  const section = {
    docs: `docs/${article.version}`,
    release: "releases",
    "use-case": "use-cases",
    blog: "blog",
    faq: "faq",
  }[article.kind];
  return `/${article.locale}/${section}/${article.slug}/`;
}
export function sourceText(id: string) {
  const source = sources.find((item) => item.id === id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  const text = readText(source.path);
  if (hash(text) !== source.sha256)
    throw new Error(`Source checksum mismatch: ${id}`);
  return text;
}
export function recipeHash(id: string) {
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe) throw new Error(`Unknown recipe: ${id}`);
  return hash(JSON.stringify(recipe));
}
export const harnessFiles = [
  "verification/Dockerfile",
  "verification/run.py",
  "verification/start.sh",
];
export const harnessHash = () =>
  hash(
    harnessFiles.map((file) => readText(file)).join("\n") +
      JSON.stringify(release),
  );
