"use client";

// THROWAWAY: Seven layout studies and four motion studies on /en/ and /zh-CN/.
// Question: how should a Redis-compatible database introduce its SSD performance
// and capacity-cost advantages? A/B/C preserve the first set; D/E/F lead with
// product identity before value in Astra's additional directions.
// G pairs two graphs beside the product introduction, following the supplied layout.
// H/I/J animate the latest main homepage: entrance, ambient flow, scroll narrative.
// K combines H's title/chart entrance with J's illustrations, without reading progress.
// Switch with ?variant=A through K. Motion controls link back to the layout studies.
// Run: npm run dev -- --hostname 127.0.0.1 --port 3100
import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BenchmarkChart, type BenchmarkRow } from "./benchmark";
import { PrototypeSwitcher } from "./prototype-switcher";
import "./homepage-prototype.css";
import { VariantD, VariantE, VariantF } from "./homepage-prototype-astra";
import { VariantG } from "./homepage-prototype-dual";
import {
  HomepageMotionPrototype,
  motionVariants,
} from "./homepage-motion-prototype";

const variants = [
  {
    key: "A",
    name: "打破直觉",
    question: "SSD 比内存快 → 实测支撑 → 20× 容量成本优势",
    component: VariantA,
  },
  {
    key: "B",
    name: "让数据说话",
    question: "性能主张 → 首屏 GET / SET 对比 → 成本加分",
    component: VariantB,
  },
  {
    key: "C",
    name: "工程师工作台",
    question: "熟悉的客户端 → NVMe 引擎 → 实测性能 → 成本优势",
    component: VariantC,
  },
  {
    key: "D",
    name: "性能头条",
    question: "SSD 数据库 → Redis 兼容 → 性能与成本",
    component: VariantD,
  },
  {
    key: "E",
    name: "换一种介质",
    question: "SSD 数据库 → Redis 兼容 → 性能与容量优势",
    component: VariantE,
  },
  {
    key: "F",
    name: "引擎换新",
    question: "SSD 数据库 → 熟悉的 Redis 客户端 → 性能与成本",
    component: VariantF,
  },
  {
    key: "G",
    name: "双图首屏",
    question: "SSD Redis 数据库 → 更快吞吐 + 1/20 容量成本",
    component: VariantG,
  },
];

export type Props = {
  locale: string;
  rows: BenchmarkRow[];
  capacityRatio: string;
  sourceUrl: string;
  benchmarkDate: string;
  benchmarkScope: string;
};

function Actions({ locale }: Pick<Props, "locale">) {
  const zh = locale === "zh-CN";
  return (
    <div className="prototype-actions">
      <Link
        className="button primary"
        href={`/${locale}/docs/0.1.0/quick-start/`}
      >
        {zh ? "开始使用 Lavik" : "Start with Lavik"}
        <span>→</span>
      </Link>
      <Link className="button secondary" href={`/${locale}/benchmarks/`}>
        {zh ? "查看基准测试" : "See the benchmarks"}
        <span>↗</span>
      </Link>
    </div>
  );
}

function Evidence({ locale, sourceUrl, benchmarkDate, benchmarkScope }: Props) {
  const zh = locale === "zh-CN";
  return (
    <div className="prototype-evidence container">
      <span className="prototype-kicker">
        {zh ? "测试依据" : "THE MEASUREMENTS"} / {benchmarkDate}
      </span>
      <p>
        {benchmarkScope}{" "}
        <a href={sourceUrl}>{zh ? "原始报告" : "Source report"} ↗</a>
      </p>
    </div>
  );
}

function CostBonus({ locale, capacityRatio }: Props) {
  const zh = locale === "zh-CN";
  return (
    <section className="prototype-cost container">
      <div>
        <span className="prototype-kicker">
          {zh ? "更快之后，还有一个好消息" : "THE OTHER PART OF THE STORY"}
        </span>
        <h2>
          {zh
            ? "性能赢了。容量成本也赢了。"
            : "Win on speed. And on capacity cost."}
        </h2>
        <p>
          {zh
            ? "值容量按 SSD 的价格扩展。内存留给紧凑的键索引。"
            : "Scale your values at SSD prices. Keep a compact key index in memory."}
        </p>
      </div>
      <div className="prototype-cost-number">
        <strong>
          {capacityRatio}
          <span>×</span>
        </strong>
        <span>{zh ? "更低的值容量成本" : "lower value-capacity cost"}</span>
      </div>
      <Link href={`/${locale}/cost/`}>
        {zh ? "计算你的节省" : "Model your savings"} ↗
      </Link>
      <p className="prototype-cost-note">
        {zh
          ? `基于 DRAM / SSD 每 GiB 单价 ${capacityRatio}:1 的假设；值容量成本为 1/${capacityRatio}。索引内存、存储放大及服务器成本另计。`
          : `At a ${capacityRatio}:1 DRAM / SSD price per GiB, value capacity costs 1/${capacityRatio} as much. Index memory, storage amplification, and server costs are additional.`}
      </p>
    </section>
  );
}

export function VariantA(props: Props) {
  const { locale, rows } = props;
  const zh = locale === "zh-CN";
  const [lavik, redis, valkey] = rows;
  return (
    <main id="main" className="homepage-prototype prototype-a" data-variant="A">
      <section className="prototype-a-hero container">
        <div className="prototype-a-copy">
          <span className="prototype-kicker">
            <i />{" "}
            {zh ? "NVMe SSD，重新定义速度" : "NVMe SSD. A NEW SPEED STANDARD."}
          </span>
          <h1>
            {zh ? (
              <>
                数据在 SSD。
                <br />
                速度，
                <br />
                <em>超越内存。</em>
              </>
            ) : (
              <>
                SSD storage.
                <br />
                Faster than
                <br />
                <em>in-memory.</em>
              </>
            )}
          </h1>
          <p className="prototype-lead">
            {zh
              ? "Lavik 将值存储在 NVMe SSD，在已发布的 GET / SET 测试中，峰值吞吐量超过内存中的 Redis 和 Valkey。"
              : "Lavik stores values on NVMe SSD — and outperforms in-memory Redis and Valkey in published peak GET / SET throughput tests."}
          </p>
          <Actions locale={locale} />
          <p className="prototype-license">
            Apache 2.0 <span>·</span> Redis clients <span>·</span> RESP2 / RESP3
          </p>
        </div>
        <div className="prototype-a-visual">
          <div className="prototype-visual-heading">
            <span>01 / {zh ? "速度，从 SSD 开始" : "SPEED STARTS ON SSD"}</span>
            <span className="prototype-live">SPDK ENGINE</span>
          </div>
          <div className="prototype-ssd-scene" aria-hidden="true">
            <div className="prototype-orbit orbit-one" />
            <div className="prototype-orbit orbit-two" />
            <span className="prototype-ssd-label">NVMe / VALUE STORAGE</span>
            <div className="prototype-ssd-board">
              <div className="prototype-ssd-logo">
                lavik<span>NVMe</span>
              </div>
              <div className="prototype-chip">
                VALUE
                <br />
                STORE
              </div>
              <div className="prototype-chip">
                VALUE
                <br />
                STORE
              </div>
              <div className="prototype-ssd-pins" />
            </div>
            <span className="prototype-ssd-caption">
              {zh
                ? "速度，不再由存储介质定义。"
                : "A different engine. A different ceiling."}
            </span>
          </div>
          <div className="prototype-a-readout">
            <div>
              <span className="prototype-kicker">
                {zh ? "峰值 GET 吞吐量" : "PEAK GET THROUGHPUT"}
              </span>
              <strong>
                {(lavik.get / 1_000_000).toFixed(2)}
                <span>M</span>
              </strong>
              <small>
                {zh
                  ? "次请求 / 秒 · 值在 NVMe SSD"
                  : "requests / second · values on NVMe SSD"}
              </small>
            </div>
            <span className="prototype-readout-arrow">↗</span>
          </div>
          <div className="prototype-peer-baseline">
            <span>{zh ? "内存对照 · GET" : "IN-MEMORY PEERS · GET"}</span>
            <span>
              Redis <b>{(redis.get / 1_000_000).toFixed(3)}M</b>
            </span>
            <span>
              Valkey <b>{(valkey.get / 1_000_000).toFixed(3)}M</b>
            </span>
          </div>
        </div>
      </section>
      <div className="prototype-a-facts container">
        <div>
          <strong>{(lavik.get / 1_000_000).toFixed(2)}M</strong>
          <span>{zh ? "峰值 GET / 秒" : "peak GET requests / sec"}</span>
        </div>
        <div>
          <strong>{(lavik.set / 1000).toFixed(1)}K</strong>
          <span>{zh ? "峰值 SET / 秒" : "peak SET requests / sec"}</span>
        </div>
        <div>
          <strong>Redis / Valkey</strong>
          <span>
            {zh
              ? "两项峰值吞吐量均超过内存对照"
              : "higher peak throughput in both tests"}
          </span>
        </div>
      </div>
      <CostBonus {...props} />
      <Evidence {...props} />
    </main>
  );
}

export function VariantB(props: Props) {
  const { locale, rows, benchmarkDate } = props;
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="homepage-prototype prototype-b" data-variant="B">
      <section className="prototype-b-hero container">
        <span className="prototype-kicker">
          <i />{" "}
          {zh
            ? "开源 · Redis 兼容 · NVMe 原生"
            : "OPEN SOURCE · REDIS COMPATIBLE · NVMe NATIVE"}
        </span>
        <h1>
          {zh ? (
            <>
              SSD 的容量。
              <br />
              <em>超越内存的吞吐量。</em>
            </>
          ) : (
            <>
              Beyond in-memory speed.
              <br />
              <em>On SSD.</em>
            </>
          )}
        </h1>
        <p className="prototype-lead">
          {zh
            ? "内存曾经是高性能的前提。Lavik 在 NVMe SSD 上，跑出了超过 Redis / Valkey 的 GET 和 SET 峰值吞吐量。"
            : "Memory used to be the price of performance. Lavik beats in-memory Redis / Valkey on peak GET and SET throughput, with values on NVMe SSD."}
        </p>
        <Actions locale={locale} />
        <div className="prototype-b-benchmark">
          <div className="prototype-b-chart-title">
            <span>
              {zh
                ? "看数据，验证直觉。"
                : "The numbers change the conversation."}
            </span>
            <span>10M keys · 1 KiB · {benchmarkDate}</span>
          </div>
          <BenchmarkChart rows={rows} locale={locale} />
          <div className="prototype-b-chart-footer">
            <span>
              <i /> Lavik: NVMe SSD
            </span>
            <span>Redis / Valkey: DRAM</span>
            <Link href={`/${locale}/benchmarks/`}>
              {zh ? "方法与完整结果" : "Methodology & full results"} ↗
            </Link>
          </div>
        </div>
      </section>
      <CostBonus {...props} />
      <Evidence {...props} />
    </main>
  );
}

export function VariantC(props: Props) {
  const { locale, rows, benchmarkDate } = props;
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="homepage-prototype prototype-c" data-variant="C">
      <section className="prototype-c-hero container">
        <div className="prototype-c-copy">
          <span className="prototype-kicker">
            {zh
              ? "Redis 兼容的 NVMe 数据引擎"
              : "THE REDIS-COMPATIBLE NVMe ENGINE"}
          </span>
          <h1>
            {zh ? (
              <>
                熟悉的客户端。
                <br />
                SSD 的引擎。
                <br />
                <em>更快的结果。</em>
              </>
            ) : (
              <>
                Your Redis clients.
                <br />
                An SSD engine.
                <br />
                <em>A faster result.</em>
              </>
            )}
          </h1>
          <p className="prototype-lead">
            {zh
              ? "让 SSD 承载数据，让 Lavik 释放性能。在已发布的 SPDK GET / SET 测试中，峰值吞吐量超过内存 Redis / Valkey。"
              : "Put your values on SSD. Put Lavik to work. Higher peak throughput than in-memory Redis / Valkey in published SPDK GET / SET tests."}
          </p>
          <Actions locale={locale} />
          <div className="prototype-c-architecture">
            <span>Redis client</span>
            <b>→</b>
            <span>
              Lavik<strong>{zh ? "内存键索引" : "key index / DRAM"}</strong>
            </span>
            <b>→</b>
            <span>
              NVMe SSD<strong>{zh ? "值数据" : "your values"}</strong>
            </span>
          </div>
        </div>
        <div className="prototype-c-console">
          <div className="prototype-console-title">
            <span>
              <i />
              <i />
              <i />
            </span>
            <span>lavik / benchmark.snapshot</span>
            <span>↗</span>
          </div>
          <div className="prototype-console-body">
            <p className="prototype-console-command">
              <span>$</span> compare lavik redis valkey
            </p>
            <p className="prototype-console-meta">
              {zh
                ? "已发布的测量数据，不是实时测试"
                : "Published measurements, not a live run"}
              <br />
              SPDK · 10M × 1 KiB · {benchmarkDate}
            </p>
            <BenchmarkChart rows={rows} locale={locale} />
            <div className="prototype-console-result">
              <span>RESULT</span>
              <strong>
                {zh
                  ? "数据在 SSD，吞吐量领先。"
                  : "SSD-backed. Ahead on throughput."}
              </strong>
              <span>✓ GET &nbsp; ✓ SET</span>
            </div>
          </div>
        </div>
      </section>
      <section className="prototype-c-principles container">
        <article>
          <span>01 / PERFORMANCE</span>
          <h2>{zh ? "性能先行。" : "Performance comes first."}</h2>
          <p>
            {zh
              ? "百万级 GET 吞吐量，实测超过内存 Redis / Valkey。"
              : "A million GETs per second. Measured ahead of in-memory Redis / Valkey."}
          </p>
        </article>
        <article>
          <span>02 / FAMILIARITY</span>
          <h2>{zh ? "熟悉的接口。" : "Speak the same protocol."}</h2>
          <p>
            {zh
              ? "RESP2 / RESP3，沿用 Redis 客户端。按应用核对命令与行为兼容性。"
              : "RESP2 / RESP3 with Redis clients. Check command and behavior compatibility for your application."}
          </p>
        </article>
        <article>
          <span>03 / CAPACITY</span>
          <h2>{zh ? "按 SSD 成本扩容。" : "Grow at SSD prices."}</h2>
          <p>
            {zh
              ? "内存保留键索引，NVMe 承载值。性能之外，容量经济性也改变了。"
              : "Keys indexed in memory. Values on NVMe. A new capacity equation, alongside the speed."}
          </p>
        </article>
      </section>
      <CostBonus {...props} />
      <Evidence {...props} />
    </main>
  );
}

export function HomepagePrototype({
  children,
  ...props
}: Props & { children: ReactNode }) {
  const current = useSearchParams().get("variant");
  if (process.env.NODE_ENV === "production") return children;
  const motion = motionVariants.find((variant) => variant.key === current);
  if (motion)
    return (
      <>
        <HomepageMotionPrototype
          key={motion.key}
          variant={motion.key}
          locale={props.locale}
        >
          {children}
        </HomepageMotionPrototype>
        <PrototypeSwitcher variants={motionVariants} current={motion.key} />
      </>
    );
  const selected = variants.find((variant) => variant.key === current);
  if (!selected) return children;
  const Variant = selected.component;
  return (
    <>
      <Variant {...props} />
      <PrototypeSwitcher variants={variants} current={selected.key} />
    </>
  );
}
