import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Locale } from "../content/schema";

const bilingual = z
  .object({ en: z.string().min(1), "zh-CN": z.string().min(1) })
  .strict();
const argument = z.union([z.string(), z.object({ ref: z.string() }).strict()]);
export const stepSchema = z
  .object({
    argv: z.array(argument).optional(),
    expect: z.record(z.string(), z.unknown()),
    read: z.boolean().optional(),
    connection: z.string().optional(),
    capture: z.string().optional(),
    scanAll: z.boolean().optional(),
  })
  .strict();
export const caseSchema = z
  .object({
    name: z.string(),
    group: z.string(),
    syntax: z.string(),
    scope: z.string(),
    steps: z.array(stepSchema).min(1),
  })
  .strict();
export const catalogSchema = z
  .object({
    introduction: bilingual,
    commands: z
      .array(
        z
          .object({
            name: z.string(),
            syntax: z.string().min(1),
            summary: bilingual,
            notes: bilingual,
          })
          .strict(),
      )
      .length(217),
  })
  .strict();
export const clientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    language: z.string(),
    version: z.string(),
    protocol: z.string(),
    argv: z.array(z.string()),
    file: z.string(),
    source: z.url(),
    settings: z.string(),
  })
  .strict();
export type ManualCase = z.infer<typeof caseSchema>;
export type ManualCommand = z.infer<typeof catalogSchema>["commands"][number];
export type ManualClient = z.infer<typeof clientSchema>;
export type VerifiedStep = z.infer<typeof stepSchema> & {
  actual: unknown;
  passed: boolean;
  iterations?: { argv: string[]; actual: unknown }[];
};
export interface CommandEvidence {
  name: string;
  scope: string;
  status: string;
  steps: VerifiedStep[];
  error?: string;
}
export interface ClientEvidence {
  id: string;
  version: string;
  checks: string[];
  status: string;
  error?: string;
  argv: string[];
}
export interface EvidenceBase {
  sourceCommit: string;
  binaryVersion: string;
  binarySha256: string;
  architecture: string;
  platform: string;
  startedAt: string;
  finishedAt: string;
  imageId: string;
  status: string;
  harnessFiles: Record<string, string>;
  serverArgv: string[];
  dockerArgv: string[];
}
export interface CommandReport extends EvidenceBase {
  commands: CommandEvidence[];
  gracefulRestart: string;
  unsupported: { argv: string[]; actual: { error: string } }[];
}
export interface ClientReport extends EvidenceBase {
  clients: ClientEvidence[];
  clientSourceFiles: Record<string, string>;
  runtimes: Record<string, string>;
  shutdownProbes: {
    id: string;
    argv: string[];
    timeoutSeconds: number;
    outcome: string;
    stdout: string;
    stderr: string;
  }[];
}

export const manualVersion = "0.1.0";
export const manualDirectory = "content/manual/0.1.0";
export const evidenceDirectory = "evidence/manual/0.1.0";
export function readManualFile<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as T;
}
export function fileHash(file: string) {
  return createHash("sha256")
    .update(fs.readFileSync(path.resolve(file)))
    .digest("hex");
}
export function manualCatalog() {
  return catalogSchema.parse(readManualFile(`${manualDirectory}/catalog.json`));
}
export function manualCases() {
  return z
    .array(caseSchema)
    .parse(readManualFile(`${manualDirectory}/cases.json`));
}
export function manualClients() {
  return z
    .array(clientSchema)
    .parse(readManualFile("verification/manual/clients/catalog.json"));
}
export function commandReport() {
  return readManualFile<CommandReport>(`${evidenceDirectory}/commands.json`);
}
export function clientReport() {
  return readManualFile<ClientReport>(`${evidenceDirectory}/clients.json`);
}
export function clientSource(client: ManualClient) {
  return fs.readFileSync(
    path.resolve("verification/manual/clients", client.file),
    "utf8",
  );
}
export function manualRoutes() {
  return [
    "docs/0.1.0/commands",
    "docs/0.1.0/clients",
    ...manualCases().map((c) => `docs/0.1.0/commands/${c.name.toLowerCase()}`),
    ...manualClients().map((c) => `docs/0.1.0/clients/${c.id}`),
  ];
}
export function manualTitle(route: string, locale: Locale) {
  if (route === "docs/0.1.0/commands")
    return locale === "en" ? "Command reference" : "命令参考";
  if (route === "docs/0.1.0/clients")
    return locale === "en" ? "Client library compatibility" : "客户端兼容性";
  const name = route.split("/").at(-1)!;
  if (route.startsWith("docs/0.1.0/commands/"))
    return manualCases().find((c) => c.name.toLowerCase() === name)?.name;
  if (route.startsWith("docs/0.1.0/clients/"))
    return manualClients().find((c) => c.id === name)?.name;
  return undefined;
}
export const groups: Record<string, { en: string; "zh-CN": string }> = {
  connection: { en: "Connections", "zh-CN": "连接" },
  strings: { en: "Strings", "zh-CN": "字符串" },
  bitmaps: { en: "Bitmaps", "zh-CN": "位图" },
  keys: { en: "Keys & expiration", "zh-CN": "键与过期时间" },
  lists: { en: "Lists", "zh-CN": "列表" },
  hashes: { en: "Hashes", "zh-CN": "哈希" },
  sets: { en: "Sets", "zh-CN": "集合" },
  "sorted-sets": { en: "Sorted sets", "zh-CN": "有序集合" },
  geospatial: { en: "Geospatial", "zh-CN": "地理空间" },
  streams: { en: "Streams", "zh-CN": "流" },
  transactions: { en: "Transactions", "zh-CN": "事务" },
  scripting: { en: "Lua & functions", "zh-CN": "Lua 与函数" },
  pubsub: { en: "Pub/Sub", "zh-CN": "发布/订阅" },
  server: { en: "Server & administration", "zh-CN": "服务与管理" },
};
