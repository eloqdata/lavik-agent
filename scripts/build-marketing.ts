import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const out = "apps/marketing/out";
await fs.mkdir(out, { recursive: true });
for (const file of ["index.html", "app.js", "style.css"])
  await fs.copyFile(`apps/marketing/public/${file}`, `${out}/${file}`);
await fs.copyFile(
  "apps/web/public/logo/lavik-logo-black.svg",
  `${out}/logo.svg`,
);
await fs.copyFile(
  "node_modules/qrcode-generator/dist/qrcode.js",
  `${out}/qr.js`,
);
// Test worker uses the same published catalogue. The console Worker never serves these paths publicly.
for (const file of ["campaign-links.json", "discovery-manifest.json"])
  await fs.copyFile(`apps/web/out/${file}`, `${out}/${file}`);
const files: Record<string, string> = {};
for (const file of ["index.html", "app.js", "style.css", "qr.js", "logo.svg"])
  files[file] = createHash("sha256")
    .update(await fs.readFile(`${out}/${file}`))
    .digest("hex");
await fs.writeFile(
  `${out}/version.json`,
  JSON.stringify({
    revision: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    files,
  }) + "\n",
);
console.log("Marketing console assets built.");
