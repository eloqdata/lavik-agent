"use client";
import { useState } from "react";
import type { Locale } from "../../../packages/content/schema";
import { storage320Rows } from "../../../packages/benchmarks/storage-data";
export function BenchmarkSnapshot({
  locale,
  rows = storage320Rows,
  scope = "storage",
}: {
  locale: Locale;
  rows?: {
    name: string;
    get: number;
    set: number;
    getP999: number;
    setP999: number;
  }[];
  scope?: "storage" | "memory";
}) {
  const zh = locale === "zh-CN",
    connections = scope === "memory" ? "1,280" : "320",
    [operation, setOperation] = useState<"get" | "set">("get"),
    [metric, setMetric] = useState<"qps" | "latency">("qps");
  const value = (r: (typeof rows)[number]) =>
    metric === "qps"
      ? r[operation]
      : r[operation === "get" ? "getP999" : "setP999"];
  const maximum = Math.max(...rows.map(value));
  return (
    <section className="benchmark-snapshot" aria-labelledby="snapshot-title">
      <h2 id="snapshot-title">
        {zh
          ? `相同 ${connections} 个连接下的表现`
          : `At the same ${connections} connections`}
      </h2>
      <p>
        {scope === "memory"
          ? zh
            ? "1,000 万键 × 1 KiB。原始 memtier 结果中的峰值吞吐量及同点 p99.9。Redis 使用 16 个 I/O 线程；Valkey GET 使用 16 个、SET 使用 8 个。QPS 四舍五入为整数。"
            : "10 million keys × 1 KiB. Peak throughput and same-point p99.9 from the raw memtier results. Redis uses 16 I/O threads; Valkey uses 16 for GET and 8 for SET. QPS is rounded to whole operations."
          : zh
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
        {rows.map((r) => (
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
                ? Math.round(value(r)).toLocaleString("en-US")
                : value(r).toFixed(3)}
            </strong>
          </div>
        ))}
      </div>
      <div
        className="benchmark-table-scroll"
        role="region"
        aria-label={
          zh
            ? `${connections} 连接结果`
            : `Results at ${connections} connections`
        }
        tabIndex={0}
      >
        <table>
          <caption>
            {zh
              ? `所有结果 · ${connections} 个连接`
              : `All results · ${connections} connections`}
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
            {rows.map((r) => (
              <tr key={r.name}>
                <th scope="row">{r.name}</th>
                <td>{Math.round(r.get).toLocaleString("en-US")}</td>
                <td>{r.getP999.toFixed(3)}</td>
                <td>{Math.round(r.set).toLocaleString("en-US")}</td>
                <td>{r.setP999.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
