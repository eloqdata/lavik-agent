export type CostInputs = {
  dramPerGiB: number;
  ssdPerGiB: number;
  datasetGiB: number;
  indexFraction: number;
  storageAmplification: number;
  sharedCost: number;
};
export function estimateCost(input: CostInputs) {
  for (const [key, value] of Object.entries(input))
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${key}`);
  if (
    !input.dramPerGiB ||
    !input.ssdPerGiB ||
    !input.datasetGiB ||
    input.indexFraction > 1 ||
    input.storageAmplification < 1
  )
    throw new Error(
      "Prices and dataset must be positive; index fraction must be 0–1; amplification at least 1",
    );
  const redis = input.sharedCost + input.datasetGiB * input.dramPerGiB;
  const lavik =
    input.sharedCost +
    input.datasetGiB * input.indexFraction * input.dramPerGiB +
    input.datasetGiB * input.storageAmplification * input.ssdPerGiB;
  return {
    redis,
    lavik,
    ratio: redis / lavik,
    savingsPercent: (1 - lavik / redis) * 100,
    capacityRatio: input.dramPerGiB / input.ssdPerGiB,
  };
}
