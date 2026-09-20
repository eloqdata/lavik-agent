import { publishCampaign } from "../packages/agents/publish.ts";
const id = process.argv[2];
if (!id) throw new Error("Usage: npm run agent:publish -- campaign-id");
await publishCampaign(id);
console.log(
  `Campaign ${id} published to the local content repository. Production deployment is a separate CI action.`,
);
