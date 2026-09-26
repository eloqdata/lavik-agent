import fs from "node:fs/promises";
import { verifyLivePublication } from "../packages/admin/publish.ts";
const input = JSON.parse(await fs.readFile(process.argv[2], "utf8"));
await verifyLivePublication(input.record);
console.log(`Verified live bilingual publication ${input.record.taskId}`);
