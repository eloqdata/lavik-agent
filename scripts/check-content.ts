import {
  articles,
  articlePath,
  claims,
  sources,
  sourceText,
} from "../packages/content/repository.ts";
import { publicationErrors } from "../packages/content/gate.ts";
import { manualPublicationErrors } from "../packages/manual/gate.ts";

const failures: string[] = [];
failures.push(...manualPublicationErrors());
const pages = articles();
const routes = new Set<string>();
for (const source of sources) sourceText(source.id);
for (const claim of claims) for (const id of claim.sources) sourceText(id);
for (const article of pages) {
  const route = articlePath(article);
  if (routes.has(route)) failures.push(`Duplicate route: ${route}`);
  routes.add(route);
  failures.push(
    ...publicationErrors(article).map((error) => `${route}: ${error}`),
  );
  if (
    !pages.some(
      (other) =>
        other.id === article.id &&
        other.locale !== article.locale &&
        other.version === article.version &&
        other.kind === article.kind &&
        other.slug === article.slug,
    )
  )
    failures.push(`${route}: missing language edition`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Publication checks passed: ${pages.length} pages, ${sources.length} pinned sources, bilingual editions and execution evidence.`,
  );
