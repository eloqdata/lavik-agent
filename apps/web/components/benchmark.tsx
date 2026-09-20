"use client";
import { useState } from "react";
export type BenchmarkRow = {
  name: string;
  get: number;
  set: number;
  getP99: number;
  setP99: number;
};
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
            <strong>{row[command].toLocaleString("en-US")}</strong>
          </div>
          <div className="bar-track">
            <div
              className={
                row.name.startsWith("Lavik ") ? "bar lavik-bar" : "bar"
              }
              style={{ width: `${(row[command] / maximum) * 100}%` }}
            />
          </div>
          <small>p99 {command === "get" ? row.getP99 : row.setP99} ms</small>
        </div>
      ))}
    </div>
  );
}
