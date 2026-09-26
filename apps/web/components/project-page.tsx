import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { AnalyticsPreference } from "./analytics";
export function ProjectPage({
  locale,
  kind,
}: {
  locale: Locale;
  kind: "about" | "privacy";
}) {
  const zh = locale === "zh-CN";
  if (kind === "privacy")
    return (
      <main id="main" className="container wide-page">
        <p className="eyebrow">LAVIK / {zh ? "隐私" : "PRIVACY"}</p>
        <h1>{zh ? "网站统计与隐私" : "Website analytics and privacy"}</h1>
        <div className="prose">
          <p>
            {zh
              ? "我们使用托管在 Cloudflare 上的第一方统计，了解哪些文章和推广渠道帮助读者评估 Lavik。统计记录页面路径、推广来源、媒介、活动标识及汇总事件数，按小时聚合，采用 180 天保留窗口，每日清理。"
              : "We use first-party analytics hosted on Cloudflare to understand which articles and channels help readers evaluate Lavik. Analytics records page paths, campaign source, medium, campaign identifiers, and aggregate event counts in hourly buckets, with a 180-day retention window and daily cleanup."}
          </p>
          <p>
            {zh
              ? "统计数据库不记录访客身份标识、IP 地址、浏览器指纹或完整网址查询字符串。浏览器标签页的 sessionStorage 保存当前访问的来源与少量计数状态，在 30 分钟无活动或活动来源改变后重置；不会生成跨站跟踪标识。Cloudflare 仍会为提供网站和防滥用而处理网络请求信息。"
              : "The analytics database does not record visitor identifiers, IP addresses, browser fingerprints, or full URL query strings. Browser-tab sessionStorage retains the current visit’s attribution and small counters, resetting after 30 minutes of inactivity or a campaign change. It does not create a cross-site tracking identifier. Cloudflare still processes network request information to serve and protect the website."}
          </p>
          <p>
            {zh
              ? "我们统计访问、页面浏览、至少 20 秒的可见阅读时间、安装指南访问以及下载、GitHub 和社区链接点击。这些指标不能证明软件已经安装。没有可用推广标记或来源信息的访问归为“直接 / 未知”。"
              : "We count visits, page views, at least 20 seconds of visible reading, installation-guide visits, and clicks to downloads, GitHub, and community links. These measures do not prove software installation. Visits without usable campaign or referrer information are classified as direct / unknown."}
          </p>
          <p>
            {zh
              ? "我们尊重浏览器的 Do Not Track 和 Global Privacy Control 信号。也可以使用下方按钮在此浏览器退出统计；偏好保存在 localStorage，清除网站存储会重置它。"
              : "We respect browser Do Not Track and Global Privacy Control signals. You can also opt out in this browser below; the preference is stored in localStorage and resets if you clear site storage."}
          </p>
          <AnalyticsPreference />
          <p>
            <a href="https://github.com/eloqdata/lavik-agent/issues">
              {zh ? "反馈网站问题" : "Report a website issue"} ↗
            </a>
          </p>
        </div>
      </main>
    );
  return (
    <main id="main" className="container wide-page">
      <p className="eyebrow">LAVIK / {zh ? "关于" : "ABOUT"}</p>
      <h1>
        {zh
          ? "让数据容量随 NVMe SSD 扩展。"
          : "Let data capacity grow with NVMe SSD."}
      </h1>
      <div className="prose">
        <p>
          {zh
            ? "Lavik 是 EloqData 的 Apache 2.0 开源 Redis 兼容键值存储。它将紧凑的键索引保存在 DRAM 中，将值存储在 NVMe SSD 上，为增长中的数据集提供不同于全内存存储的容量成本结构。当前发布版本为 0.1.0-beta.1。"
            : "Lavik is an Apache 2.0 open-source, Redis-compatible key-value store from EloqData. It keeps a compact key index in DRAM and stores values on NVMe SSD, giving growing datasets a different capacity-cost structure from an all-memory store. The current release is 0.1.0-beta.1."}
        </p>
        <h2>{zh ? "性能与容量成本" : "Performance and capacity cost"}</h2>
        <p>
          {zh
            ? "在已发布的 SPDK GET/SET 基准测试中，Lavik 的峰值吞吐量高于 Redis 和 Valkey。按 DRAM/NVMe SSD 每 GiB 单价比 20:1 计算，同样大小的值数据的介质容量成本降低 95%。索引内存、运行时内存、副本、服务器和运维成本另计；具体工作负载需要单独验证延迟和可用性目标。"
            : "In the published SPDK GET/SET benchmark, Lavik exceeded Redis and Valkey peak throughput. At a 20:1 DRAM/NVMe SSD price per GiB, the storage-capacity cost for the same value payload is 95% lower. Index and runtime memory, replicas, servers, and operations are additional; each workload needs its own latency and availability evaluation."}
        </p>
        <p>
          <Link href={`/${locale}/benchmarks/`}>
            {zh ? "查看基准测试" : "Read the benchmarks"}
          </Link>{" "}
          ·{" "}
          <Link href={`/${locale}/cost/`}>
            {zh ? "计算容量成本" : "Calculate capacity cost"}
          </Link>
        </p>
        <h2>{zh ? "从你的应用开始评估" : "Evaluate your application"}</h2>
        <p>
          {zh
            ? "Lavik 支持 RESP2 和 RESP3。选择你的安装方式，检查实际使用的命令和客户端，然后按照迁移指南验证数据、错误处理和运行行为。beta 版本提供了具体的测试范围和已知限制，不能据此推断所有 Redis 功能完全兼容。"
            : "Lavik supports RESP2 and RESP3. Choose an installation method, check the commands and clients your application uses, then follow the migration guides to validate data, error handling, and operational behavior. The beta has specific tested coverage and known limitations; this is not a claim of complete Redis compatibility."}
        </p>
        <ul>
          <li>
            <Link href={`/${locale}/docs/0.1.0/`}>
              {zh ? "安装与用户手册" : "Installation and user manual"}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/docs/0.1.0/compatibility/`}>
              {zh ? "兼容性概览" : "Compatibility overview"}
            </Link>
          </li>
          <li>
            <Link href={`/${locale}/docs/0.1.0/migrate-redis/`}>
              {zh ? "从 Redis 迁移" : "Migrate from Redis"}
            </Link>
          </li>
        </ul>
        <h2>{zh ? "开放协作" : "An open project"}</h2>
        <p>
          {zh
            ? "Lavik 项目文章以源码、设计文档和记录的实验为依据。欢迎通过 GitHub 提交问题、贡献代码和分享可复现的评估结果。"
            : "Lavik project articles draw on source code, design documents, and recorded experiments. Contributions, issue reports, and reproducible evaluation results are welcome on GitHub."}
        </p>
        <p>
          <a href="https://github.com/eloqdata/lavik">GitHub ↗</a> ·{" "}
          <Link href={`/${locale}/community/`}>
            {zh ? "加入社区" : "Join the community"}
          </Link>{" "}
          · <a href="https://x.com/LavikCommunity">@LavikCommunity ↗</a>
        </p>
      </div>
    </main>
  );
}
