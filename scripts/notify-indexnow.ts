import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
type Manifest = { revision: string; pages: Record<string, string> };
const previousFile = path.resolve(".cache/indexnow-previous.json"),
  receiptFile = path.resolve(".cache/indexnow-result.json");
await fs.mkdir(path.dirname(previousFile), { recursive: true });
if (process.argv.includes("--capture")) {
  try {
    const r = await fetch("https://lavik.dev/discovery-manifest.json", {
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as Manifest;
    if (!data.pages) throw new Error("No page manifest");
    await fs.writeFile(previousFile, JSON.stringify(data));
  } catch (e) {
    await fs.writeFile(
      previousFile,
      JSON.stringify({ revision: "unknown", pages: {} }),
    );
    console.log(
      `Previous discovery manifest unavailable: ${(e as Error).message}`,
    );
  }
} else {
  const expected = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const current = JSON.parse(
    await fs.readFile("apps/web/out/discovery-manifest.json", "utf8"),
  ) as Manifest;
  if (current.revision !== expected)
    throw new Error("Discovery manifest does not represent this commit");
  const prior = JSON.parse(
    await fs.readFile(previousFile, "utf8").catch(() => '{"pages":{}}'),
  ) as Manifest;
  const urls = [
    ...new Set([
      ...Object.keys(current.pages).filter(
        (url) => current.pages[url] !== prior.pages[url],
      ),
      ...Object.keys(prior.pages).filter((url) => !(url in current.pages)),
    ]),
  ];
  const config = JSON.parse(
    await fs.readFile("content/discovery.json", "utf8"),
  );
  let result: Record<string, unknown> = {
    revision: expected,
    urls,
    at: new Date().toISOString(),
  };
  try {
    const manifest = (await fetch(
      `https://lavik.dev/discovery-manifest.json?revision=${expected}`,
      { cache: "no-store", signal: AbortSignal.timeout(20_000) },
    ).then((r) => r.json())) as Manifest;
    if (manifest.revision !== expected)
      throw new Error("Live deployment not confirmed; notification deferred");
    const key = await fetch(`https://lavik.dev/${config.indexNowKey}.txt`, {
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.text());
    if (key.trim() !== config.indexNowKey)
      throw new Error("IndexNow public key file is not live");
    if (urls.length) {
      const r = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: "lavik.dev",
          key: config.indexNowKey,
          keyLocation: `https://lavik.dev/${config.indexNowKey}.txt`,
          urlList: urls,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      result = {
        ...result,
        status:
          r.status === 200
            ? "accepted"
            : r.status === 202
              ? "pending_validation"
              : "failed",
        httpStatus: r.status,
      };
    } else result = { ...result, status: "unchanged" };
  } catch (e) {
    result = { ...result, status: "failed", error: (e as Error).message };
  }
  await fs.writeFile(receiptFile, JSON.stringify(result, null, 2) + "\n");
  console.log(
    `IndexNow: ${result.status}; ${urls.length} changed or removed URLs. Indexing is determined by participating search engines.`,
  );
  if (result.status === "failed")
    console.log(
      `::warning::Discovery notification needs retry; see indexnow-result artifact.`,
    );
}
