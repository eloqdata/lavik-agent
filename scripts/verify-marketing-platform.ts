import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const origin = "https://marketing.lavik.dev",
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
const expected = JSON.parse(
  await fs.readFile("apps/marketing/out/version.json", "utf8"),
) as { revision: string; files: Record<string, string> };
assert.equal(expected.revision, revision);
const get = (path: string) =>
  fetch(`${origin}${path}`, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    const response = await get("/version.json");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    const shell = await get("/");
    assert.equal(shell.status, 200);
    assert.match(await shell.text(), /Lavik Marketing/);
    assert.match(shell.headers.get("X-Robots-Tag")!, /noindex/);
    assert.equal(shell.headers.get("Cache-Control"), "no-store");
    for (const path of [
      "/api/report",
      "/api/placements",
      "/api/links",
      "/api/catalogue",
    ])
      assert.equal((await get(path)).status, 401);
    assert.equal((await get("/api/bootstrap")).status, 404);
    for (const [file, hash] of Object.entries(expected.files)) {
      const asset = await get(`/${file}`);
      assert.equal(asset.status, 200);
      assert.equal(
        createHash("sha256")
          .update(new Uint8Array(await asset.arrayBuffer()))
          .digest("hex"),
        hash,
      );
    }
    console.log(
      `Marketing console ${revision} is live; private APIs require sign-in.`,
    );
    process.exit(0);
  } catch (e) {
    if (attempt === 11) throw e;
    await new Promise((r) => setTimeout(r, 10000));
  }
}
