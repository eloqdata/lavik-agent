import { articles } from "../../../../../../packages/content/repository";
import { blogPresentation } from "../../../../../../packages/blog/presentation";
import { blogCoverSvg } from "../../../../../../packages/blog/cover";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return [
    ...new Set(
      articles()
        .filter((a) => a.kind === "blog")
        .map((a) => a.id),
    ),
  ].map((id) => ({ file: `${id}.svg` }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const editions = articles().filter(
    (article) => article.kind === "blog" && `${article.id}.svg` === file,
  );
  const article = editions.find((a) => a.locale === "en");
  if (!article) return new Response("Not found", { status: 404 });
  const presentation = blogPresentation(article);
  if (
    editions.some(
      (a) =>
        JSON.stringify(blogPresentation(a)) !== JSON.stringify(presentation),
    )
  )
    throw new Error(
      `Blog translations must share topics and artwork: ${article.id}`,
    );
  return new Response(blogCoverSvg(article.id, presentation.motif), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
