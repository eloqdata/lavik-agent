export type DeploymentRun = {
  status: string;
  conclusion: string | null;
  url: string;
};
export async function waitForDeployment(options: {
  readRuns: () => Promise<DeploymentRun[]>;
  onRun: (run: DeploymentRun) => Promise<void>;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}) {
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.timeoutMs ?? 25 * 60_000);
  while (now() < deadline) {
    const current = (await options.readRuns())[0];
    if (current) {
      await options.onRun(current);
      if (current.status === "completed") {
        if (current.conclusion !== "success")
          throw new Error(
            `Deployment workflow ${current.conclusion}: ${current.url}`,
          );
        return current;
      }
    }
    await sleep(Math.max(0, Math.min(15_000, deadline - now())));
  }
  throw new Error(
    "Deployment workflow completion timed out; keep deploying state for reconciliation. Published requires successful CI and live verification.",
  );
}
