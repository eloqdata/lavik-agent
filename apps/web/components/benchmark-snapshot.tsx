"use client";
import { useState } from "react";
import type { Locale } from "../../../packages/content/schema";
import { storage80Rows } from "../../../packages/benchmarks/storage-data";
export function BenchmarkSnapshot({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN",
    [operation, setOperation] = useState<"get" | "set">("get"),
    [metric, setMetric] = useState<"qps" | "latency">("qps");
  const value = (r: (typeof storage80Rows)[number]) =>
    metric === "qps"
      ? r[operation]
      : r[operation === "get" ? "getP999" : "setP999"];
  const maximum = Math.max(...storage80Rows.map(value));
  return (
    <section className="benchmark-snapshot" aria-labelledby="snapshot-title">
      <h2 id="snapshot-title">
        {zh ? "相同 80 个连接下的表现" : "At the same 80 connections"}
      </h2>
      <p>
        {zh
          ? "十亿键 × 1 KiB。吞吐量与 p99.9 来自同一测量点。完整扫描及各自峰值见下方报告。"
          : "One billion keys × 1 KiB. Throughput and p99.9 come from the same measured point. The full sweep and selected peaks follow in the report."}
      </p>
      <div className="benchmark-controls">
        <div role="group" aria-label={zh ? "操作" : "Operation"}>
          {(["get", "set"] as const).map((op) => (
            <button
              type="button"
              key={op}
              aria-pressed={op === operation}
              onClick={() => setOperation(op)}
            >
              {op.toUpperCase()}
            </button>
          ))}
        </div>
        <div role="group" aria-label={zh ? "指标" : "Metric"}>
          {(["qps", "latency"] as const).map((m) => (
            <button
              type="button"
              key={m}
              aria-pressed={m === metric}
              onClick={() => setMetric(m)}
            >
              {m === "qps" ? "QPS" : "p99.9"}
            </button>
          ))}
        </div>
      </div>
      <p className="benchmark-axis">
        {metric === "qps"
          ? zh
            ? "QPS · 越高越好"
            : "QPS · higher is better"
          : zh
            ? "p99.9 毫秒 · 越低越好"
            : "p99.9 milliseconds · lower is better"}
      </p>
      <div className="benchmark-bars">
        {storage80Rows.map((r) => (
          <div className="benchmark-bar-row" key={r.name}>
            <span>{r.name}</span>
            <div className="benchmark-bar-track">
              <span
                className={r.name.startsWith("Lavik") ? "lavik-measure" : ""}
                style={{ width: (value(r) / maximum) * 100 + "%" }}
              />
            </div>
            <strong>
              {metric === "qps"
                ? value(r).toLocaleString("en-US")
                : value(r).toFixed(3)}
            </strong>
          </div>
        ))}
      </div>
      <div
        className="benchmark-table-scroll"
        role="region"
        aria-label={zh ? "80 连接结果" : "Results at 80 connections"}
        tabIndex={0}
      >
        <table>
          <caption>
            {zh ? "所有结果 · 80 个连接" : "All results · 80 connections"}
          </caption>
          <thead>
            <tr>
              <th scope="col">{zh ? "系统" : "System"}</th>
              <th scope="col">GET QPS</th>
              <th scope="col">GET p99.9 (ms)</th>
              <th scope="col">SET QPS</th>
              <th scope="col">SET p99.9 (ms)</th>
            </tr>
          </thead>
          <tbody>
            {storage80Rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{r.get.toLocaleString("en-US")}</td>
                <td>{r.getP999.toFixed(3)}</td>
                <td>{r.set.toLocaleString("en-US")}</td>
                <td>{r.setP999.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
