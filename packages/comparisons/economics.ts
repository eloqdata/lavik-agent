// An illustrative sizing model, not a prediction of cluster performance.
export function nodeEstimate(input: {
  dataGiB: number;
  usableGiB: number;
  targetQps: number;
  observedQps: number;
  utilization: number;
  copies: number;
  monthlyNodePrice: number;
}) {
  const {
    dataGiB,
    usableGiB,
    targetQps,
    observedQps,
    utilization,
    copies,
    monthlyNodePrice,
  } = input;
  if (
    Object.values(input).some((n) => !Number.isFinite(n) || n <= 0) ||
    utilization > 1 ||
    !Number.isInteger(copies)
  )
    throw new Error(
      "Sizing inputs must be positive; utilization ≤ 1; copies an integer.",
    );
  const capacityNodes = Math.ceil(dataGiB / usableGiB);
  const throughputNodes = Math.ceil(targetQps / (observedQps * utilization));
  const primaries = Math.max(capacityNodes, throughputNodes);
  return {
    capacityNodes,
    throughputNodes,
    primaries,
    nodes: primaries * copies,
    monthly: primaries * copies * monthlyNodePrice,
  };
}
export function capacityEstimate(
  dataGiB: number,
  dramPrice: number,
  ssdPrice: number,
) {
  if ([dataGiB, dramPrice, ssdPrice].some((n) => !Number.isFinite(n) || n <= 0))
    throw new Error("Capacity inputs must be positive.");
  return {
    dram: dataGiB * dramPrice,
    ssd: dataGiB * ssdPrice,
    ratio: dramPrice / ssdPrice,
  };
}
