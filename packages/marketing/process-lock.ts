import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type Owner = { pid: number; nonce: string; children: number[] };
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw e;
  }
};
export const groupAlive = (pid: number) => alive(-pid);
function read(directory: string): Owner {
  const owner = JSON.parse(
    fs.readFileSync(path.join(directory, "owner.json"), "utf8"),
  );
  if (
    !Number.isInteger(owner.pid) ||
    owner.pid <= 0 ||
    typeof owner.nonce !== "string" ||
    !Array.isArray(owner.children) ||
    owner.children.some((p: number) => !Number.isInteger(p) || p <= 0)
  )
    throw new Error(
      "Invalid lock identity; inspect it manually before recovery",
    );
  return owner;
}
export function acquireProcessLock(directory: string) {
  const owner: Owner = { pid: process.pid, nonce: randomUUID(), children: [] };
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    throw new Error(
      "Marketing lock exists. No process or model was started. Inspect status/logs; use marketing.ts recover only after the previous coordinator and child groups have stopped.",
    );
  }
  const write = () => {
    fs.writeFileSync(path.join(directory, "owner.tmp"), JSON.stringify(owner), {
      mode: 0o600,
    });
    fs.renameSync(
      path.join(directory, "owner.tmp"),
      path.join(directory, "owner.json"),
    );
  };
  write();
  const owned = () => {
    if (read(directory).nonce !== owner.nonce)
      throw new Error("Lock ownership changed");
  };
  return {
    addChild(pid: number) {
      owned();
      owner.children.push(pid);
      write();
    },
    removeChild(pid: number) {
      owned();
      if (groupAlive(pid))
        throw new Error(`Child group ${pid} is still active; lock retained`);
      owner.children = owner.children.filter((p) => p !== pid);
      write();
    },
    release() {
      owned();
      if (owner.children.some(groupAlive))
        throw new Error("Active child processes remain; lock retained");
      fs.rmSync(directory, { recursive: true });
    },
  };
}
// Recovery is explicit and never kills a potentially reused PID or unlocks a
// running coordinator. An exclusive guard and nonce check prevent competing
// recoverers from deleting a newly acquired lock.
export function recoverProcessLock(directory: string) {
  const owner = read(directory);
  const guard = path.join(directory, "recovery");
  fs.mkdirSync(guard, { mode: 0o700 });
  let removed = false;
  try {
    if (read(directory).nonce !== owner.nonce)
      throw new Error("Lock ownership changed during recovery");
    if (alive(owner.pid) || owner.children.some(groupAlive))
      throw new Error(
        "Coordinator or child process group is still active; recovery refused",
      );
    fs.rmSync(directory, { recursive: true });
    removed = true;
  } finally {
    if (!removed && fs.existsSync(guard)) fs.rmdirSync(guard);
  }
}
