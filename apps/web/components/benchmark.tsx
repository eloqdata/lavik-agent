"use client";
import { useState } from "react";
export type BenchmarkRow = {
  name: string;
  get: number;
  set: number;
  getP999: number;
  setP999: number;
  approximate: boolean;
};
const throughput = (row: BenchmarkRow, command: "get" | "set") =>
  (row.approximate ? "≈ " : "") +
  (row[command] / 1000).toLocaleString("en-US", {
    minimumFractionDigits: row.approximate ? 0 : 1,
    maximumFractionDigits: row.approximate ? 0 : 1,
  }) +
  "k";
const latency = (row: BenchmarkRow, command: "get" | "set") =>
  (row.approximate ? "≈ " : "") +
  (command === "get" ? row.getP999 : row.setP999) +
  " ms";
export function BenchmarkChart({
  rows,
  locale,
}: {
  rows: BenchmarkRow[];
  locale: string;
}) {
  const [command, setCommand] = useState<"get" | "set">("get");
  const maximum = Math.max(...rows.map((row) => row[command]));
  return (
    <div className="benchmark-chart">
      <div className="chart-heading">
        <span>
          {locale === "en"
            ? "Peak throughput · requests / second"
            : "峰值吞吐量 · 次 / 秒"}
        </span>
        <div className="segmented" role="group" aria-label="Workload">
          {(["get", "set"] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setCommand(value)}
              aria-pressed={command === value}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {rows.map((row) => (
        <div className="chart-row" key={row.name}>
          <div>
            <span>{row.name}</span>
            <strong>{throughput(row, command)}</strong>
          </div>
          <div className="bar-track">
            <div
              className={
                row.name.startsWith("Lavik ") ? "bar lavik-bar" : "bar"
              }
              style={{ width: `${(row[command] / maximum) * 100}%` }}
            />
          </div>
          <small>p99.9 {latency(row, command)}</small>
        </div>
      ))}
      <p className="chart-caption">
        {locale === "en"
          ? "10M keys · 1 KiB values · 1,280 connections. Lavik: reported figures; ≈ peers: graph estimates."
          : "1,000 万键 · 1 KiB 值 · 1,280 个连接。Lavik 为报告数值；≈ 对照为图表近似值。"}
      </p>
      <div className="table-scroll">
        <table className="benchmark-data">
          <caption>
            {locale === "en"
              ? "Complete peak-throughput comparison"
              : "完整峰值吞吐量对比"}
          </caption>
          <thead>
            <tr>
              <th scope="col">{locale === "en" ? "System" : "系统"}</th>
              <th scope="col">GET QPS</th>
              <th scope="col">GET p99.9</th>
              <th scope="col">SET QPS</th>
              <th scope="col">SET p99.9</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td>{throughput(row, "get")}</td>
                <td>{latency(row, "get")}</td>
                <td>{throughput(row, "set")}</td>
                <td>{latency(row, "set")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
