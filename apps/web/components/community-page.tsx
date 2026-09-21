import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";

export function CommunityPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  return (
    <main id="main" className="container wide-page resource-page">
      <p className="eyebrow">LAVIK / {zh ? "社区" : "COMMUNITY"}</p>
      <h1>{zh ? "一起构建 Lavik。" : "Build Lavik together."}</h1>
      <p className="page-lead">
        {zh
          ? "欢迎来到 Lavik Community。分享你的应用，讨论 Redis / Valkey 迁移，帮助一个年轻的开源项目成长。"
          : "Welcome to Lavik Community. Share what you're building, talk through a Redis / Valkey migration, and help shape a young open-source project."}
      </p>
      <div className="community-grid">
        <article className="community-card">
          <span className="community-symbol" aria-hidden="true">
            #
          </span>
          <p className="eyebrow">LAVIK COMMUNITY</p>
          <h2>Slack</h2>
          <p>
            {zh
              ? "讨论部署与客户端集成，交流测试结果，认识一起使用 Lavik 的开发者。"
              : "Talk through deployment and client integration, compare test results, and meet other developers exploring Lavik."}
          </p>
          <a className="button" href="https://lavik.dev/community/slack/">
            {zh ? "加入 Slack" : "Join Slack"} ↗
          </a>
          <a
            className="text-link community-signin"
            href="https://lavikcommunity.slack.com/"
          >
            {zh
              ? "已是成员？登录工作区"
              : "Already a member? Open the workspace"}
          </a>
        </article>
        <article className="community-card">
          <span className="community-symbol" aria-hidden="true">
            &gt;_
          </span>
          <p className="eyebrow">LAVIK COMMUNITY</p>
          <h2>Discord</h2>
          <p>
            {zh
              ? "加入开放讨论，提出想法，分享学习和构建过程中的发现。"
              : "Join the conversation, bring an idea, and share what you discover while learning and building with Lavik."}
          </p>
          <a className="button" href="https://lavik.dev/community/discord/">
            {zh ? "加入 Discord" : "Join Discord"} ↗
          </a>
        </article>
        <article className="community-card">
          <span className="community-symbol" aria-hidden="true">
            {"{ }"}
          </span>
          <p className="eyebrow">OPEN SOURCE · APACHE 2.0</p>
          <h2>GitHub</h2>
          <p>
            {zh
              ? "报告可复现的问题、提出功能建议、改进文档，或贡献代码。"
              : "Report a reproducible bug, suggest a feature, improve the docs, or contribute code."}
          </p>
          <a
            className="button secondary"
            href="https://github.com/eloqdata/lavik"
          >
            {zh ? "探索代码仓库" : "Explore the repository"} ↗
          </a>
        </article>
      </div>
      <p className="invite-help">
        {zh ? "邀请链接失效？" : "Invite link expired?"}{" "}
        <a
          className="text-link"
          href="https://github.com/eloqdata/lavik-agent/issues/new?title=Community%20invite%20link%20needs%20renewing"
        >
          {zh ? "告诉我们，获取新邀请。" : "Let us know so we can renew it."}
        </a>
      </p>
      <section className="community-contribute">
        <h2>{zh ? "每一份贡献都很重要。" : "Every contribution counts."}</h2>
        <div className="resource-grid">
          <Link className="resource-card" href={`/${locale}/download/`}>
            <span className="eyebrow">01 / {zh ? "试用" : "TRY IT"}</span>
            <h3>{zh ? "运行你的工作负载" : "Bring your workload"} →</h3>
            <p>
              {zh
                ? "下载 beta 版本，用真实应用评估兼容性与性能。"
                : "Download the beta and evaluate compatibility and performance with your application."}
            </p>
          </Link>
          <a
            className="resource-card"
            href="https://github.com/eloqdata/lavik/issues"
          >
            <span className="eyebrow">
              02 / {zh ? "反馈" : "GIVE FEEDBACK"}
            </span>
            <h3>
              {zh ? "分享可复现的发现" : "Share a reproducible finding"} ↗
            </h3>
            <p>
              {zh
                ? "请注明 Lavik 版本、运行环境、执行命令、预期结果与实际结果。"
                : "Include your Lavik version, environment, commands, expected result, and actual result."}
            </p>
          </a>
          <Link className="resource-card" href={`/${locale}/docs/0.1.0/`}>
            <span className="eyebrow">03 / {zh ? "学习" : "LEARN"}</span>
            <h3>{zh ? "从文档开始" : "Start with the docs"} →</h3>
            <p>
              {zh
                ? "查阅命令、实测客户端示例，以及当前验证范围。"
                : "Explore commands, tested client examples, and the scope of the current verification."}
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
