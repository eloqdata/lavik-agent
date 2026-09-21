"use client";
import { useState, useId } from "react";
import type { Locale } from "../../../packages/content/schema";
import {
  storageSystems,
  selectStoragePoint,
  type StoragePoint,
} from "../../../packages/use-cases/measurements";

export function LatencyExplorer({
  locale,
  points,
}: {
  locale: Locale;
  points: StoragePoint[];
}) {
  const zh = locale === "zh-CN",
    id = useId();
  const [workload, setWorkload] = useState<"GET" | "SET">("GET");
  const [limit, setLimit] = useState("1");
  return (
    <div className="latency-explorer">
      <div className="latency-controls">
        <div
          className="latency-operation"
          role="group"
          aria-label={zh ? "操作类型" : "Operation"}
        >
          {(["GET", "SET"] as const).map((op) => (
            <button
              key={op}
              type="button"
              aria-pressed={op === workload}
              onClick={() => setWorkload(op)}
            >
              {op}
            </button>
          ))}
        </div>
        <label htmlFor={id}>
          {zh ? "实测 p99 上限" : "Measured p99 limit"}
          <select
            id={id}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          >
            {["1", "2", "5", "10", "50"].map((n) => (
              <option key={n} value={n}>
                ≤ {n} ms
              </option>
            ))}
            <option value="peak">
              {zh ? "显示吞吐量峰值" : "Show peak throughput"}
            </option>
          </select>
        </label>
      </div>
      <p className="latency-selection" role="status">
        {limit === "peak"
          ? zh
            ? `${workload}：每个系统的实测吞吐量峰值及该点延迟。`
            : `${workload}: each system's measured throughput peak and latency at that point.`
          : zh
            ? `${workload}：p99 ≤ ${limit} ms 的采样点中，吞吐量最高的一点。`
            : `${workload}: the highest-throughput sampled point with p99 ≤ ${limit} ms.`}
      </p>
      <div className="solution-table-scroll">
        <table className="latency-table">
          <thead>
            <tr>
              <th>{zh ? "系统" : "System"}</th>
              <th>QPS</th>
              <th>p99</th>
              <th>p99.9</th>
              <th>{zh ? "连接数" : "Connections"}</th>
            </tr>
          </thead>
          <tbody>
            {storageSystems.map((system) => {
              const point = selectStoragePoint(
                points,
                system.id,
                workload,
                limit === "peak" ? null : Number(limit),
              );
              return (
                <tr
                  key={system.id}
                  data-system={system.id}
                  className={
                    system.id === "lavik-spdk" ? "lavik-result" : undefined
                  }
                >
                  <th scope="row">{system.name}</th>
                  {point ? (
                    <>
                      <td className="result-qps">
                        {Math.round(point.qps).toLocaleString("en-US")}
                      </td>
                      <td>{point.p99.toFixed(3)} ms</td>
                      <td>{point.p999.toFixed(3)} ms</td>
                      <td>{point.connections.toLocaleString("en-US")}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="no-sample">
                      {zh
                        ? "没有满足该上限的采样点"
                        : "No sampled point meets this limit"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="latency-note">
        {zh
          ? "仅筛选已发布的离散测量点，不插值。闭环、无速率限制的 60 秒测试，不能直接作为生产 SLO 或推断其他配置也无法达标。"
          : "Filters published discrete measurements without interpolation. These are closed-loop, unlimited-rate, 60-second tests; they do not certify a production SLO or rule out other configurations."}
      </p>
    </div>
  );
}
