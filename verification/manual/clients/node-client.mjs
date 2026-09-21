// Run: node node-client.mjs redis|ioredis|iovalkey|glide [2|3]. Fixture only.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const library = process.argv[2];
const protocol = Number(process.argv[3] ?? 2);
const checks = [];
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push(name); process.stderr.write(`${library}: ${name} passed\n`); };
let packageName = library;

if (library === "glide") {
  packageName = "@valkey/valkey-glide";
  const { GlideClient, ProtocolVersion } = await import(packageName);
  const client = await GlideClient.createClient({ addresses: [{ host: "127.0.0.1", port: 6379 }],
    credentials: { username: "default", password: "manual-test-only" }, protocol: ProtocolVersion.RESP3, requestTimeout: 5000 });
  try {
    check("authenticated PING", await client.ping(), "PONG");
    check("SET", await client.set("node-glide:text", "Hello 世界"), "OK");
    check("Unicode GET", await client.get("node-glide:text"), "Hello 世界");
    check("missing GET", await client.get("node-glide:missing"), null);
    await client.hset("node-glide:hash", { field: "value" });
    check("HGET", await client.hget("node-glide:hash", "field"), "value");
    check("Lua EVAL (raw API)", await client.customCommand(["EVAL", "return redis.call('GET',KEYS[1])", "1", "node-glide:text"]), "Hello 世界");
  } finally { client.close(); }
} else {
  let client, call, close;
  if (library === "redis") {
    const { createClient } = await import("redis");
    client = createClient({ RESP: protocol, username: "default", password: "manual-test-only",
      socket: { host: "127.0.0.1", port: 6379, connectTimeout: 5000, reconnectStrategy: false } });
    client.on("error", (error) => process.stderr.write(error.message + "\n"));
    await client.connect();
    call = (args) => client.sendCommand(args);
    close = () => client.close();
  } else {
    const Client = (await import(library)).default;
    client = new Client({ host: "127.0.0.1", port: 6379, username: "default", password: "manual-test-only", protocol,
      connectTimeout: 5000, commandTimeout: 5000, maxRetriesPerRequest: 0, retryStrategy: () => null });
    call = (args) => client.call(...args);
    close = () => process.argv.includes("--quit-probe") ? client.quit() : client.disconnect();
  }
  try {
    check("authenticated PING", await client.ping(), "PONG");
    await call(["DEL", "node:hash", "node:list"]);
    check("SET", await client.set("node:text", "Hello 世界"), "OK");
    check("Unicode GET", await client.get("node:text"), "Hello 世界");
    check("missing GET", await client.get("node:missing"), null);
    check("HSET (raw API)", await call(["HSET", "node:hash", "field", "value"]), 1);
    check("HGET (raw API)", await call(["HGET", "node:hash", "field"]), "value");
    await call(["RPUSH", "node:list", "a", "b"]);
    check("LRANGE (raw API)", await call(["LRANGE", "node:list", "0", "-1"]), ["a", "b"]);
    const transaction = client.multi().set("node:counter", "1").incr("node:counter").get("node:counter");
    check("MULTI/EXEC", await transaction.exec(), library === "redis" ? ["OK", 2, "2"] : [[null, "OK"], [null, 2], [null, "2"]]);
    const values = await Promise.all([client.get("node:text"), client.get("node:counter")]);
    check("concurrent requests", values, ["Hello 世界", "2"]);
    check("Lua EVAL (raw API)", await call(["EVAL", "return redis.call('GET',KEYS[1])", "1", "node:counter"]), "2");
    await call(["SET", "node:expiry", "value", "PX", "60000"]);
    const ttl = await call(["PTTL", "node:expiry"]);
    check("PX/PTTL (raw API)", ttl > 0 && ttl <= 60000, true);
  } finally { await close(); process.stderr.write(`${library}: cleanup completed\n`); }
}
// Read the exact installed package, not a guessed range.
const version = JSON.parse(fs.readFileSync(`/clients/node_modules/${packageName}/package.json`, "utf8")).version;
console.log(JSON.stringify({ library: packageName, version, protocol: library === "glide" ? 3 : protocol, checks, status: "passed" }));
