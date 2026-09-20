"use client";
import { useState } from "react";
import { estimateCost } from "../../../packages/content/economics";

export function CostCalculator({ locale }: { locale: string }) {
  const zh = locale === "zh-CN";
  const [ratio, setRatio] = useState(20);
  const [index, setIndex] = useState(2);
  const [shared, setShared] = useState(10);
  const result = estimateCost({
    dramPerGiB: ratio,
    ssdPerGiB: 1,
    datasetGiB: 1,
    indexFraction: index / 100,
    storageAmplification: 1,
    sharedCost: (ratio * shared) / 100,
  });
  return (
    <div className="calculator">
      <div className="calculator-controls">
        <p className="eyebrow">
          {zh ? "可调整的假设" : "Adjustable assumptions"}
        </p>
        <label htmlFor="price-ratio">
          {zh
            ? "DRAM / SSD 容量单价比"
            : "DRAM / SSD price per unit of capacity"}
          <strong>{ratio}:1</strong>
        </label>
        <input
          id="price-ratio"
          type="range"
          min="2"
          max="50"
          value={ratio}
          onChange={(e) => setRatio(Number(e.target.value))}
        />
        <label htmlFor="index-share">
          {zh ? "Lavik 内存 / 数据容量" : "Lavik memory / payload capacity"}
          <strong>{index}%</strong>
        </label>
        <input
          id="index-share"
          type="range"
          min="0"
          max="30"
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
        />
        <label htmlFor="shared-cost">
          {zh
            ? "两端相同的其他成本 / Redis 数据内存成本"
            : "Shared costs / Redis payload memory cost"}
          <strong>{shared}%</strong>
        </label>
        <input
          id="shared-cost"
          type="range"
          min="0"
          max="100"
          step="5"
          value={shared}
          onChange={(e) => setShared(Number(e.target.value))}
        />
        <p className="muted">
          {zh
            ? "默认值用于解释公式，不是硬件报价或实测内存占用。假设相同副本数、不使用压缩、存储放大为 1。"
            : "Defaults illustrate the formula; they are not hardware quotes or measured memory usage. Assumes equal replica counts, no compression, and storage amplification of 1."}
        </p>
      </div>
      <div className="calculator-result" aria-live="polite">
        <span>
          {zh ? "此假设下的模型成本比" : "Modeled cost ratio in this scenario"}
        </span>
        <strong>
          {result.ratio.toFixed(2)}
          <small>×</small>
        </strong>
        <p>
          {zh
            ? `模型中 Lavik 成本降低 ${result.savingsPercent.toFixed(1)}%`
            : `${result.savingsPercent.toFixed(1)}% lower modeled Lavik cost`}
        </p>
        <div className="formula">
          Redis = shared + payload × DRAM
          <br />
          Lavik = shared + index × DRAM + payload × SSD
        </div>
        <p>
          {zh
            ? "该模型不预测延迟、持久性或可用性。性能需求还可能改变服务器数量与配置。"
            : "This model does not predict latency, durability, or availability. Performance requirements may change the required server count and configuration."}
        </p>
      </div>
    </div>
  );
}
