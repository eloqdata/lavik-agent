import {
  historicalAssets,
  historicalAsset,
} from "../../../../../../../../packages/benchmarks/historical";
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return historicalAssets();
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ report: string; file: string }> },
) {
  const p = await params,
    data = historicalAsset(p.report, p.file);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": p.file.endsWith(".svg")
        ? "image/svg+xml; charset=utf-8"
        : "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
