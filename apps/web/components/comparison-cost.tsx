"use client";
import { useId, useState } from "react";
import type { Locale } from "../../../packages/content/schema";
import {
  nodeEstimate,
  capacityEstimate,
} from "../../../packages/comparisons/economics";
import {
  bestPoint,
  type Measurement,
} from "../../../packages/comparisons/points";
const number = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });
export function ComparisonCost({
  locale,
  peer,
  memory,
  points,
}: {
  locale: Locale;
  peer: string;
  memory: boolean;
  points: { lavik: Measurement[]; peer: Measurement[] };
}) {
  const zh = locale === "zh-CN",
    id = useId();
  const [values, setValues] = useState({
    data: "1024",
    capacity: "1024",
    target: "1000000",
    utilization: "70",
    copies: "2",
    lavikPrice: "1000",
    peerPrice: "1000",
    dram: "5",
    ssd: "0.25",
  });
  const [workload, setWorkload] = useState<Measurement["workload"]>("GET");
  const [limit, setLimit] = useState("0");
  const v = Object.fromEntries(
    Object.entries(values).map(([k, n]) => [k, Number(n)]),
  ) as Record<keyof typeof values, number>;
  const fields: [keyof typeof values, string][] = memory
    ? [
        ["data", zh ? "值数据容量（GiB）" : "Value dataset (GiB)"],
        [
          "dram",
          zh ? "DRAM 假设单价（美元/GiB）" : "Assumed DRAM price (USD/GiB)",
        ],
        [
          "ssd",
          zh ? "SSD 假设单价（美元/GiB）" : "Assumed SSD price (USD/GiB)",
        ],
      ]
    : [
        ["data", zh ? "值数据容量（GiB）" : "Value dataset (GiB)"],
        [
          "capacity",
          zh
            ? "每主节点可用值容量（GiB，双方相同）"
            : "Usable value GiB per primary (both)",
        ],
        ["target", zh ? "总请求速率目标（QPS）" : "Total target QPS"],
        [
          "utilization",
          zh ? "采用实测 QPS 的比例（%）" : "Fraction of observed QPS used (%)",
        ],
        [
          "copies",
          zh ? "总副本数（含主节点）" : "Total copies (including primary)",
        ],
        [
          "lavikPrice",
          zh ? "Lavik 每节点月费假设（美元）" : "Assumed Lavik USD/node/month",
        ],
        [
          "peerPrice",
          zh
            ? `${peer} 每节点月费假设（美元）`
            : `Assumed ${peer} USD/node/month`,
        ],
      ];
  const valid =
    fields.every(([key]) => Number.isFinite(v[key]) && v[key] > 0) &&
    (memory || (v.utilization <= 100 && Number.isInteger(v.copies)));
  const selected = [
    bestPoint(points.lavik, workload, Number(limit) || undefined),
    bestPoint(points.peer, workload, Number(limit) || undefined),
  ];
  const costs =
    valid && !memory
      ? selected.map((point, i) =>
          point
            ? nodeEstimate({
                dataGiB: v.data,
                usableGiB: v.capacity,
                targetQps: v.target,
                observedQps: point.qps,
                utilization: v.utilization / 100,
                copies: v.copies,
                monthlyNodePrice: i ? v.peerPrice : v.lavikPrice,
              })
            : undefined,
        )
      : [];
  const capacity =
    valid && memory ? capacityEstimate(v.data, v.dram, v.ssd) : undefined;
  return (
    <div className="comparison-calculator">
      <p className="comparison-label">
        {zh
          ? "假设模型 · 可调整输入"
          : "ILLUSTRATIVE MODEL · EDIT THE ASSUMPTIONS"}
      </p>
      <h3>
        {memory
          ? zh
            ? "20× 更低的值容量成本，从单价算起"
            : "20× lower value-capacity cost starts with the unit price"
          : zh
            ? "相同数据量与 QPS 目标，需要多少节点？"
            : "Same dataset. Same target QPS. How many nodes?"}
      </h3>
      <p>
        {memory
          ? zh
            ? "默认采用 DRAM 5 美元/GiB、NVMe SSD 0.25 美元/GiB 的假设价格，比例为 20:1。它们不是实时报价，也不是云主机月费。"
            : "The defaults assume DRAM at $5/GiB and NVMe SSD at $0.25/GiB: a 20:1 ratio. These are illustrative media prices, not live quotes or monthly cloud instance prices."
          : zh
            ? "默认模型假设 1 TiB 值数据、每主节点 1 TiB 可用值容量、100 万 QPS、使用实测吞吐量的 70%、两份完整数据副本，并假设每节点每月 1,000 美元。双方价格均可修改。"
            : "Defaults assume 1 TiB of values, 1 TiB usable value capacity per primary, 1 million QPS, 70% of observed throughput, two complete copies, and $1,000 per node per month. Both node prices are editable."}
      </p>
      <div className="comparison-inputs">
        {fields.map(([key, label]) => (
          <label key={key} htmlFor={`${id}-${key}`}>
            {label}
            <input
              id={`${id}-${key}`}
              type="number"
              min={key === "copies" ? 1 : 0.01}
              max={key === "utilization" ? 100 : undefined}
              step={key === "copies" ? 1 : "any"}
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </label>
        ))}
        {!memory && (
          <>
            <label htmlFor={`${id}-workload`}>
              {zh ? "工作负载" : "Workload"}
              <select
                id={`${id}-workload`}
                value={workload}
                onChange={(e) =>
                  setWorkload(e.target.value as Measurement["workload"])
                }
              >
                {[
                  "GET",
                  "SET",
                  ...(points.lavik.some((p) => p.workload === "MIX")
                    ? ["MIX"]
                    : []),
                ].map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-limit`}>
              {zh ? "实测 p99 筛选上限" : "Observed p99 ceiling"}
              <select
                id={`${id}-limit`}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              >
                <option value="0">
                  {zh ? "不限（峰值 QPS）" : "No ceiling (peak QPS)"}
                </option>
                {[0.5, 1, 2, 5, 10].map((n) => (
                  <option value={n} key={n}>
                    {n} ms
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      {!valid ? (
        <p role="alert">
          {zh
            ? "请输入正数；吞吐量比例不能超过 100%，副本数必须为正整数。"
            : "Enter positive numbers; throughput fraction must be at most 100%, and copies must be a positive integer."}
        </p>
      ) : (
        <div
          className="comparison-result"
          aria-live="polite"
          aria-atomic="true"
        >
          {capacity ? (
            <>
              <strong>{capacity.ratio.toFixed(1)}×</strong>
              <p>
                {zh
                  ? "DRAM / SSD 值容量成本比"
                  : "DRAM / SSD value-capacity cost ratio"}
              </p>
              <p>
                {peer} DRAM: ${number(capacity.dram)} · Lavik NVMe SSD: $
                {number(capacity.ssd)}
              </p>
            </>
          ) : (
            <div
              className="comparison-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={
                zh ? "可横向滚动的成本估算表" : "Scrollable cost estimate table"
              }
            >
              <table>
                <caption>
                  {zh
                    ? "假设线性扩展的规划结果"
                    : "Planning estimate assuming linear scaling"}
                </caption>
                <thead>
                  <tr>
                    <th>{zh ? "系统" : "System"}</th>
                    <th>{zh ? "选定实测 QPS / p99" : "Selected QPS / p99"}</th>
                    <th>
                      {zh ? "主节点 / 总节点" : "Primaries / total nodes"}
                    </th>
                    <th>{zh ? "月费假设" : "Assumed monthly cost"}</th>
                  </tr>
                </thead>
                <tbody>
                  {["Lavik SPDK", peer].map((name, i) => (
                    <tr key={name}>
                      <th scope="row">{name}</th>
                      {costs[i] && selected[i] ? (
                        <>
                          <td>
                            {number(selected[i]!.qps)} /{" "}
                            {selected[i]!.p99.toFixed(3)} ms
                          </td>
                          <td>
                            {number(costs[i]!.primaries)} /{" "}
                            {number(costs[i]!.nodes)}
                          </td>
                          <td>${number(costs[i]!.monthly)}</td>
                        </>
                      ) : (
                        <td colSpan={3}>
                          {zh
                            ? "没有满足此 p99 上限的实测点；不提供估算。"
                            : "No measured point meets this p99 ceiling; no estimate."}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      <p className="comparison-formula">
        {memory
          ? "Value-capacity cost = dataset GiB × media price/GiB"
          : "Primaries = max(⌈data / usable capacity⌉, ⌈target QPS / (observed QPS × utilization)⌉)"}
      </p>
      <p>
        {memory
          ? zh
            ? "值容量模型不含键与索引内存、缓冲区、CPU、网络、备份、副本或运维。因此 20× 值容量成本差异并不等于整体服务便宜 20 倍。请在完整成本计算器中加入索引内存与共同成本。"
            : "This value-capacity model excludes key/index memory, buffers, CPU, network, backups, replicas and operations. A 20× value-capacity difference therefore does not mean a 20× cheaper complete service. Add index memory and shared costs in the full capacity calculator."
          : zh
            ? "总节点数 = 主节点数 × 数据副本数，月费 = 总节点数 × 每节点月费。副本不计入额外服务 QPS。假设分片均衡、每节点性能可线性复用、可用容量已扣除空间余量及元数据，并且总内存足以容纳索引与缓冲区；改变每节点数据量可能改变吞吐量。复制开销、故障后余量、网络和备份费用尚未建模。p99 筛选仅选择已测点，不能证明集群或应用 SLA，尤其不能证明 P99.99。"
            : "Total nodes = primaries × copies; monthly cost = total nodes × node price. Replicas contribute no extra serving QPS here. Assumes balanced sharding, linearly reusable per-node performance, usable capacity after space/metadata reserves, and sufficient RAM for indexes and buffers; changing per-node data size can change throughput. Replication overhead, post-failure headroom, networking and backups are not modeled. The p99 filter selects observed points; it does not establish a cluster or application SLA, especially P99.99."}
      </p>
    </div>
  );
}
