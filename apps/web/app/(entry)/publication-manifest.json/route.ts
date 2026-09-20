import fs from "node:fs";
import path from "node:path";
import {
  articles,
  contentHash,
  readJson,
  root,
} from "../../../../../packages/content/repository";
import { articleReview } from "../../../../../packages/content/gate";
import type { PublicationRecord } from "../../../../../packages/admin/publish";

export const dynamic = "force-static";
export function GET() {
  const directory = path.join(root, "evidence/publications");
  const pages = articles();
  const publications = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((id) => /^[a-f0-9-]{36}$/.test(id))
        .map(
          (id) =>
            readJson(
              `evidence/publications/${id}/manifest.json`,
            ) as PublicationRecord,
        )
        .filter((record) =>
          record.editions.every((edition) => {
            const article = pages.find(
              (p) => p.id === edition.id && p.locale === edition.locale,
            );
            return (
              article &&
              contentHash(article) === edition.contentHash &&
              articleReview(article).publicationId === record.taskId
            );
          }),
        )
    : [];
  return Response.json({ schemaVersion: 1, publications });
}
