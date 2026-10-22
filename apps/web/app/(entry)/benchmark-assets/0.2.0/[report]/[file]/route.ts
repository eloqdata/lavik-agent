import { benchmarkReports } from "../../../../../../../../packages/benchmarks/catalog";
import {
  reportAssetData,
  reportAssets,
} from "../../../../../../../../packages/benchmarks/repository";
import { assertBenchmarkPublication } from "../../../../../../../../packages/benchmarks/gate";
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return reportAssets();
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ report: string; file: string }> },
) {
  const p = await params,
    r = benchmarkReports.find((r) => r.id === p.report);
  if (
    !r ||
    !reportAssets().some((a) => a.report === p.report && a.file === p.file)
  )
    return new Response("Not found", { status: 404 });
  assertBenchmarkPublication();
  const data = reportAssetData(r, p.file);
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
