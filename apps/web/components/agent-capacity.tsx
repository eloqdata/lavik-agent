"use client";
import { useState } from "react";
import {
  agentCapacity,
  capacityLabel,
} from "../../../packages/homepage/scenarios";

export function AgentCapacity({ locale }: { locale: string }) {
  const zh = locale === "zh-CN";
  const [agents, setAgents] = useState(100);
  const result = agentCapacity(agents);
  return (
    <div className="home-agent-calculator">
      <p className="home-eyebrow">
        {zh ? "容量规划示例" : "A CAPACITY PLANNING EXAMPLE"}
      </p>
      <div className="home-agent-equation">
        <span>
          1M<small>{zh ? "账户" : "accounts"}</small>
        </span>
        <b>×</b>
        <span>
          {agents}
          <small>{zh ? "智能体 / 账户" : "agents / account"}</small>
        </span>
        <b>=</b>
        <span>
          {result.profiles / 1_000_000}M
          <small>{zh ? "智能体状态记录" : "agent state records"}</small>
        </span>
      </div>
      <label htmlFor="agents-per-account">
        {zh ? "每个账户的智能体数量" : "Agents per account"}
        <strong>{agents}</strong>
      </label>
      <input
        id="agents-per-account"
        type="range"
        min="1"
        max="200"
        step="1"
        value={agents}
        onChange={(event) => setAgents(Number(event.target.value))}
      />
      <div className="home-agent-scale">
        <span>1</span>
        <span>200</span>
      </div>
      <div className="home-agent-result" aria-live="polite" aria-atomic="true">
        <strong>{capacityLabel(result.valueBytes)}</strong>
        <p>
          {zh
            ? `相同记录大小下，值数据容量为基准的 ${result.multiplier}×。`
            : `${result.multiplier}× the baseline value capacity, at the same record size.`}
        </p>
      </div>
      <p className="home-fine-print">
        {zh
          ? `假设 100 万个账户，每条状态记录 64 KiB；每账户一条记录的基准为 ${capacityLabel(result.baselineBytes)}。这是可调整的规划情景，并非所有智能体应用的增长预测。索引、复制及运行开销另计。`
          : `Assumes 1 million accounts and 64 KiB per state record. One record per account is ${capacityLabel(result.baselineBytes)}. This is an adjustable planning scenario, not a forecast for every agent application. Index, replication, and runtime overhead are additional.`}
      </p>
    </div>
  );
}
