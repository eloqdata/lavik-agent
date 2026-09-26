import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  acquireProcessLock,
  recoverProcessLock,
  groupAlive,
} from "../packages/marketing/process-lock.ts";
const modulePath = new URL(
  "../packages/marketing/process-lock.ts",
  import.meta.url,
).href;
const wrapper = path.resolve("scripts/marketing-child.mjs");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const node = (code: string, args: string[] = []) =>
  spawn(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code, ...args],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

test("coordinator crash stops its child group and preserves the lock and attempt state", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lavik-crash-")),
    lock = path.join(directory, "lock"),
    marker = path.join(directory, "activity");
  const childCode = `import fs from 'node:fs'; fs.writeFileSync(process.argv[1],'started'); setInterval(()=>fs.appendFileSync(process.argv[1],'.'),50);`;
  const parent = node(
    `import {spawn} from 'node:child_process'; import {acquireProcessLock} from ${JSON.stringify(modulePath)}; const lock=acquireProcessLock(process.argv[1]); const child=spawn(process.execPath,[${JSON.stringify(wrapper)},String(process.pid),process.execPath,'--input-type=module','-e',${JSON.stringify(childCode)},process.argv[2]],{detached:true,stdio:['pipe','ignore','ignore']}); lock.addChild(child.pid); child.stdin.end('go\\n'); console.log(child.pid); setInterval(()=>{},1000);`,
    [lock, marker],
  );
  let group = 0;
  try {
    group = Number((await once(parent.stdout!, "data"))[0].toString().trim());
    for (let i = 0; i < 60; i++) {
      if (await fs.stat(marker).catch(() => null)) break;
      await wait(50);
    }
    assert.match(await fs.readFile(marker, "utf8"), /^started/);
    const closed = once(parent, "close");
    parent.kill("SIGKILL");
    await closed;
    assert.throws(() => acquireProcessLock(lock), /lock exists/);
    await wait(700);
    const stopped = await fs.readFile(marker, "utf8");
    await wait(350);
    assert.equal(
      await fs.readFile(marker, "utf8"),
      stopped,
      "No child work continues after coordinator death",
    );
    for (let i = 0; i < 50 && groupAlive(group); i++) await wait(100);
    assert.equal(groupAlive(group), false);
    recoverProcessLock(lock);
    const next = acquireProcessLock(lock);
    next.release();
  } finally {
    parent.kill("SIGKILL");
    if (group && groupAlive(group)) process.kill(-group, "SIGKILL");
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("concurrent explicit recoverers cannot remove a newly acquired owner lock", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lavik-lock-")),
    lock = path.join(directory, "lock");
  const departed = node("process.exit(0)");
  const deadPid = departed.pid!;
  await once(departed, "close");
  await fs.mkdir(lock);
  await fs.writeFile(
    path.join(lock, "owner.json"),
    JSON.stringify({ pid: deadPid, nonce: "stopped-owner", children: [] }),
  );
  const start = Date.now() + 500;
  const code = `import {recoverProcessLock,acquireProcessLock} from ${JSON.stringify(modulePath)}; await new Promise(r=>setTimeout(r,Math.max(0,Number(process.argv[2])-Date.now()))); try {recoverProcessLock(process.argv[1]);const owner=acquireProcessLock(process.argv[1]);await new Promise(r=>setTimeout(r,700));owner.release();}catch{process.exitCode=1;}`;
  try {
    const racers = [
      node(code, [lock, String(start)]),
      node(code, [lock, String(start)]),
    ];
    const codes = await Promise.all(
      racers.map((p) => once(p, "close").then(([code]) => code)),
    );
    assert.deepEqual(codes.sort(), [0, 1]);
    const owner = acquireProcessLock(lock);
    assert.throws(() => recoverProcessLock(lock), /still active/);
    owner.release();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test("buffered handshake cannot start work when its original coordinator died before wrapper initialization", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lavik-startup-"));
  const gate = path.join(directory, "ready"),
    marker = path.join(directory, "unexpected-model-work"),
    delay = path.join(directory, "delay.mjs");
  await fs.writeFile(
    delay,
    `import fs from 'node:fs'; while(!fs.existsSync(${JSON.stringify(gate)})) await new Promise(r=>setTimeout(r,25));`,
  );
  const parent = node(
    `import {spawn} from 'node:child_process'; const child=spawn(process.execPath,['--import',process.argv[1],${JSON.stringify(wrapper)},String(process.pid),process.execPath,'--input-type=module','-e',"import fs from 'node:fs';fs.writeFileSync(process.argv[1],'unexpected');",process.argv[2]],{detached:true,stdio:['pipe','ignore','ignore']});child.stdin.end('go\\n');console.log(child.pid);setInterval(()=>{},1000);`,
    [delay, marker],
  );
  let group = 0;
  try {
    group = Number((await once(parent.stdout!, "data"))[0].toString().trim());
    const closed = once(parent, "close");
    parent.kill("SIGKILL");
    await closed;
    await fs.writeFile(gate, "release");
    for (let i = 0; i < 50 && groupAlive(group); i++) await wait(100);
    assert.equal(groupAlive(group), false);
    assert.equal(
      await fs.stat(marker).catch(() => null),
      null,
      "No model or publication command may start",
    );
  } finally {
    parent.kill("SIGKILL");
    if (group && groupAlive(group)) process.kill(-group, "SIGKILL");
    await fs.rm(directory, { recursive: true, force: true });
  }
});
