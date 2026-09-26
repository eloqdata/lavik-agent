import { spawn } from "node:child_process";
// A child cannot run until the coordinator has persisted this process-group ID.
// EOF without the handshake (including a coordinator crash) runs nothing.
const [ownerPid, executable, ...args] = process.argv.slice(2);
const parent = Number(ownerPid);
if (!Number.isInteger(parent) || parent <= 1) process.exit(1);
let signal = "";
for await (const chunk of process.stdin) signal += chunk;
if (signal !== "go\n" || process.ppid !== parent) process.exit(1);
const stop = () => {
  try {
    process.kill(-process.pid, "SIGKILL");
  } catch {
    process.exit(1);
  }
};
const monitor = setInterval(() => {
  if (process.ppid !== parent) stop();
  try {
    process.kill(parent, 0);
  } catch {
    stop();
  }
}, 250);
const child = spawn(executable, args, {
  stdio: ["ignore", "inherit", "inherit"],
});
child.on("error", (e) => {
  console.error(e.message);
  clearInterval(monitor);
  process.exitCode = 1;
});
child.on("close", (code) => {
  clearInterval(monitor);
  process.exitCode = code ?? 1;
});
