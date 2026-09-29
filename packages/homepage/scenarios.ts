// Planning inputs, not benchmark results or a recommended cluster topology.
export const consolidationScenario = {
  redisNodes: 300,
  redisValueGiBPerNode: 32,
  lavikNodes: 3,
  lavikValueGiBPerNode: 3200,
} as const;

export const agentScenario = {
  accounts: 1_000_000,
  bytesPerProfile: 64 * 1024,
};
export function agentCapacity(agentsPerAccount: number) {
  if (
    !Number.isInteger(agentsPerAccount) ||
    agentsPerAccount < 1 ||
    agentsPerAccount > 200
  )
    throw new Error("Choose between 1 and 200 agents per account");
  const profiles = agentScenario.accounts * agentsPerAccount;
  return {
    profiles,
    valueBytes: profiles * agentScenario.bytesPerProfile,
    baselineBytes: agentScenario.accounts * agentScenario.bytesPerProfile,
    multiplier: agentsPerAccount,
  };
}
export function capacityLabel(bytes: number) {
  return bytes >= 2 ** 40
    ? `${(bytes / 2 ** 40).toFixed(2)} TiB`
    : `${(bytes / 2 ** 30).toFixed(2)} GiB`;
}
