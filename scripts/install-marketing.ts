import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { scheduleSchema } from "../packages/marketing/schedule.ts";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = scheduleSchema.parse(
  JSON.parse(
    await fs.readFile(
      path.join(root, "policies/marketing-schedule.json"),
      "utf8",
    ),
  ),
);
const directory = path.join(root, ".runs/local/marketing");
const label = "dev.lavik.marketing",
  target = path.join(os.homedir(), "Library/LaunchAgents", `${label}.plist`);
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
await fs.mkdir(directory, { recursive: true, mode: 0o700 });
await fs.mkdir(path.dirname(target), { recursive: true });
const xml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[process.execPath, "--import", "tsx", path.join(root, "scripts/marketing.ts"), "tick"].map((s) => `<string>${escape(s)}</string>`).join("")}</array><key>WorkingDirectory</key><string>${escape(root)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${escape(process.env.PATH ?? "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin")}</string></dict><key>StartCalendarInterval</key><dict><key>Hour</key><integer>${config.dailyCheckHour}</integer><key>Minute</key><integer>0</integer></dict><key>RunAtLoad</key><true/><key>ProcessType</key><string>Background</string><key>StandardOutPath</key><string>${escape(path.join(directory, "scheduler.log"))}</string><key>StandardErrorPath</key><string>${escape(path.join(directory, "scheduler.log"))}</string></dict></plist>`;
await fs.writeFile(target, xml, { mode: 0o600 });
execFileSync("plutil", ["-lint", target], { stdio: "inherit" });
const domain = `gui/${process.getuid!()}`;
try {
  execFileSync("launchctl", ["bootout", `${domain}/${label}`], {
    stdio: "ignore",
  });
} catch {}
execFileSync("launchctl", ["bootstrap", domain, target], { stdio: "inherit" });
console.log(
  `Installed ${target}. Daily ${String(config.dailyCheckHour).padStart(2, "0")}:00 local check; saved dates enforce two-day blog cadence and weekly reports. Mac must be awake and online; Docker is required for article verification.`,
);
