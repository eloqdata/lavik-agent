import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { localConnection } from "./connection";
// Values travel over stdin, never shell arguments, console output or GitHub.
const mode = process.argv[2];
const values: Record<string, string> = {};
if (mode === "database") values.EMAIL_DATABASE_URL = localConnection();
else if (mode === "outlook") {
  const raw = readFileSync(".outlook", "utf8");
  for (const name of [
    "OUTLOOK_TENANT_ID",
    "OUTLOOK_CLIENT_ID",
    "OUTLOOK_CLIENT_SECRET",
  ]) {
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(name + "="));
    if (!line) throw new Error("Missing " + name + " in .outlook");
    const value = line
      .slice(name.length + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (!value) throw new Error("Empty " + name);
    values[name] = value;
  }
} else throw new Error("Use database or outlook");
for (const [name, value] of Object.entries(values)) {
  const result = spawnSync(
    "node",
    [
      "node_modules/wrangler/bin/wrangler.js",
      "secret",
      "put",
      name,
      "--config",
      "wrangler.marketing.jsonc",
      "--env-file",
      "/dev/null",
    ],
    {
      input: value,
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  if (result.status !== 0) {
    console.error(
      "Secret installation failed for " +
        name +
        ". Check Wrangler authentication. Provider output withheld.",
    );
    process.exit(1);
  }
  console.log("Installed " + name + " in the marketing Worker.");
}
