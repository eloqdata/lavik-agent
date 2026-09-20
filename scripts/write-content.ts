import { createOpenAIRuntime } from "../packages/agents/openai.ts";
import { event, runCampaign } from "../packages/agents/workflow.ts";
import { publishCampaign } from "../packages/agents/publish.ts";
import { verifyRecipe } from "../packages/verification/runner.ts";

const [id, ...args] = process.argv.slice(2);
const draftOnly = args.includes("--draft-only");
const brief = args.filter((arg) => arg !== "--draft-only").join(" ");
if (!id || !brief)
  throw new Error(
    'Usage: npm run agent:write -- campaign-id "Campaign brief" [--draft-only]',
  );
const runtime = createOpenAIRuntime(process.env, async (type, data) => {
  await event(id, type, data);
  console.log(JSON.stringify({ at: new Date().toISOString(), type, ...data }));
});
const state = await runCampaign(id, brief, runtime, verifyRecipe);
if (state.status === "blocked") {
  console.error(state.errors.join("\n"));
  process.exitCode = 1;
} else if (!draftOnly && state.status === "ready") {
  await publishCampaign(id);
  console.log(
    `Both editions published to the content repository. Run npm run build to produce the website. Evidence: .runs/${id}/`,
  );
} else console.log(`Campaign ${id}: ${state.status}. Evidence: .runs/${id}/`);
