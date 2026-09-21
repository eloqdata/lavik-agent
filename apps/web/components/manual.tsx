import Link from "next/link";
import { notFound } from "next/navigation";
import type { Locale } from "../../../packages/content/schema";
import { release } from "../../../packages/content/repository";
import {
  clientReport,
  clientSource,
  commandReport,
  groups,
  manualCatalog,
  manualCases,
  manualClients,
  manualTitle,
  type VerifiedStep,
  type EvidenceBase,
} from "../../../packages/manual/repository";
import { CommandSearch } from "./command-search";
import { requireReviewedManual } from "../../../packages/manual/gate";
import "./manual.css";
import { DocsSidebar } from "./docs-sidebar";

export function ManualLinks({ locale }: { locale: Locale }) {
  return (
    <>
      <Link href={`/${locale}/docs/0.1.0/commands/`}>
        {locale === "en" ? "Command reference" : "命令参考"}
      </Link>
      <Link href={`/${locale}/docs/0.1.0/clients/`}>
        {locale === "en" ? "Client libraries" : "客户端库"}
      </Link>
    </>
  );
}

function renderArgument(value: string | { ref: string }) {
  if (typeof value !== "string") return `<captured:${value.ref}>`;
  return /^[a-zA-Z0-9_.:*+><=-]+$/.test(value) ? value : JSON.stringify(value);
}

function exampleTranscript(steps: VerifiedStep[]) {
  return steps
    .flatMap((step) => {
      const connection = step.connection ?? "default";
      if (step.iterations) {
        const first = step.iterations[0],
          last = step.iterations.at(-1)!;
        return [
          `# ${connection}: SCAN cursor loop (${step.iterations.length} requests)`,
          `> ${first.argv.map(renderArgument).join(" ")}`,
          JSON.stringify(first.actual),
          `# Continue with each returned cursor until it is "0".`,
          ...(step.iterations.length > 2
            ? [
                `# ${step.iterations.length - 2} intermediate replies in the downloadable receipt.`,
              ]
            : []),
          `> ${last.argv.map(renderArgument).join(" ")}`,
          JSON.stringify(last.actual),
          `# Combined keys: ${JSON.stringify(step.actual)}`,
        ];
      }
      return [
        `# connection: ${connection}`,
        step.read
          ? "# receive pushed message"
          : `> ${step.argv!.map(renderArgument).join(" ")}`,
        JSON.stringify(step.actual),
        ...(step.capture
          ? [`# Capture these exact bytes as ${step.capture}.`]
          : []),
      ];
    })
    .join("\n");
}

function EvidenceDetails({
  report,
  locale,
  kind,
}: {
  report: EvidenceBase;
  locale: Locale;
  kind: "commands" | "clients";
}) {
  const zh = locale === "zh-CN";
  return (
    <details>
      <summary>
        {zh
          ? "测试环境与可复现证据"
          : "Test environment & reproducible evidence"}
      </summary>
      <div className="manual-sources">
        <p>
          {zh ? "验证时间" : "Verified"}: {report.finishedAt} · Docker / Linux{" "}
          {report.architecture} · {report.binaryVersion}
        </p>
        <p>
          {zh ? "存储与连接" : "Storage & connection"}: io_uring ·{" "}
          {zh
            ? "临时文件、2 个工作线程、单机、明文 TCP、密码认证。此测试不衡量 NVMe 性能。"
            : "temporary file, 2 workers, standalone, plaintext TCP, password authentication. This test does not measure NVMe performance."}
        </p>
        <p>
          {zh ? "固定源码" : "Pinned source"}:{" "}
          <a
            href={`https://github.com/eloqdata/lavik/tree/${report.sourceCommit}`}
          >
            {report.sourceCommit}
          </a>
        </p>
        <p>
          {zh ? "二进制 SHA-256" : "Binary SHA-256"}:{" "}
          <code>{report.binarySha256}</code>
        </p>
        <p>
          {zh ? "镜像" : "Image"}: <code>{report.imageId}</code>
        </p>
        <a
          href={`https://github.com/eloqdata/lavik-agent/blob/main/evidence/manual/0.1.0/${kind}.json`}
        >
          {zh ? "完整测试记录" : "Full test receipt"}
        </a>
        {" · "}
        <a href="https://github.com/eloqdata/lavik-agent/tree/main/verification/manual">
          {zh ? "可执行测试" : "Executable tests"}
        </a>
      </div>
    </details>
  );
}

export function ManualPage({
  route,
  locale,
}: {
  route: string;
  locale: Locale;
}) {
  const publication = requireReviewedManual();
  const zh = locale === "zh-CN",
    title = manualTitle(route, locale);
  if (!title) notFound();
  const catalog = manualCatalog(),
    cases = manualCases(),
    clients = manualClients();
  const commands = commandReport(),
    clientResults = clientReport();
  const commandName = route.startsWith("docs/0.1.0/commands/")
    ? route.split("/").at(-1)!.toUpperCase()
    : undefined;
  const command = catalog.commands.find((c) => c.name === commandName);
  const definition = cases.find((c) => c.name === commandName);
  const result = commands.commands.find((c) => c.name === commandName);
  const client = route.startsWith("docs/0.1.0/clients/")
    ? clients.find((c) => c.id === route.split("/").at(-1))
    : undefined;
  const tested = clientResults.clients.find((c) => c.id === client?.id);
  const shutdownProbe = clientResults.shutdownProbes.find(
    (p) => p.id === client?.id,
  );
  const root = `/${locale}/docs/0.1.0`;
  return (
    <main
      id="main"
      className="container document-layout manual-page"
      data-manual-hash={publication.bundleHash}
    >
      <DocsSidebar locale={locale} route={route} />
      <article className="document">
        <div className="breadcrumb">
          <Link href={root + "/"}>{zh ? "文档" : "Docs"}</Link>
          <span>/</span>
          <span>0.1.0</span>
          {command ? (
            <>
              <span>/</span>
              <Link href={root + "/commands/"}>{zh ? "命令" : "Commands"}</Link>
            </>
          ) : null}
          {client ? (
            <>
              <span>/</span>
              <Link href={root + "/clients/"}>{zh ? "客户端" : "Clients"}</Link>
            </>
          ) : null}
        </div>
        <h1>{title}</h1>
        <div className="article-meta">
          {release.tag} · {zh ? "Docker 实测" : "Tested in Docker"} ·{" "}
          {commands.finishedAt.slice(0, 10)}
        </div>

        {route === "docs/0.1.0/commands" ? (
          <>
            <p className="document-summary">
              {zh
                ? "查找命令、理解参数，并查看在真实 Lavik 上执行的请求与结果。"
                : "Find a command, understand its arguments, and inspect requests and replies from a real Lavik instance."}
            </p>
            <div className="manual-stats">
              <div>
                <strong>{cases.length}</strong>
                <span>{zh ? "已测试的命令名称" : "command names tested"}</span>
              </div>
              <div>
                <strong>{Object.keys(groups).length}</strong>
                <span>{zh ? "命令类别" : "command families"}</span>
              </div>
              <div>
                <strong>0.1.0</strong>
                <span>{zh ? "版本固定" : "version pinned"}</span>
              </div>
            </div>
            <div className="prose">
              <p>{catalog.introduction[locale]}</p>
            </div>
            <div className="manual-scope">
              {zh
                ? "覆盖的是页面列出的具体调用与结果。注册一个命令不代表支持其所有选项。ADDREPLICAOF 目前仅测试了拒绝 NO ONE；集群、故障转移和生产 SLA 不在本次验证范围内。"
                : "Coverage applies to the calls and replies shown on each page. A registered command may not support every option. ADDREPLICAOF currently has a rejection test for NO ONE only; cluster behavior, failover and production SLAs are outside this verification."}
            </div>
            <CommandSearch
              locale={locale}
              commands={cases.map((c) => ({
                name: c.name,
                group: c.group,
                scope: c.scope,
                summary: catalog.commands.find((d) => d.name === c.name)!
                  .summary[locale],
              }))}
              groups={Object.fromEntries(
                Object.entries(groups).map(([id, names]) => [
                  id,
                  names[locale],
                ]),
              )}
            />
            <h2>
              {zh
                ? "迁移时需要关注的差异"
                : "Differences to check when migrating"}
            </h2>
            <p>
              {zh
                ? "以下调用在该发布版本中实际返回 unknown command。它们不是已支持的命令。"
                : "These calls returned unknown command in this release. They are not supported commands."}
            </p>
            <div className="manual-table-scroll">
              <table className="manual-table">
                <thead>
                  <tr>
                    <th>{zh ? "实际调用" : "Tested call"}</th>
                    <th>{zh ? "结果" : "Result"}</th>
                  </tr>
                </thead>
                <tbody>
                  {commands.unsupported.map((c) => (
                    <tr key={c.argv[0]}>
                      <td>
                        <code>{c.argv.join(" ")}</code>
                      </td>
                      <td>{c.actual.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {zh
                ? "CLIENT TRACKING ON 和 COMMAND INFO get 也返回不支持的子命令错误。请检查客户端默认功能和连接时发送的命令。"
                : "CLIENT TRACKING ON and COMMAND INFO get also return unsupported-subcommand errors. Check the commands and optional features your client sends during connection setup."}
            </p>
            <EvidenceDetails
              report={commands}
              locale={locale}
              kind="commands"
            />
            <p className="manual-sources">
              {zh ? "文档组织参考" : "Documentation organization reference"}:{" "}
              <a href="https://valkey.io/docs/">Valkey docs</a> ·{" "}
              <a href="https://valkey.io/commands/">Valkey command reference</a>
              .{" "}
              {zh
                ? "行为说明以固定版本的 Lavik 源码和实测结果为准。"
                : "Behavior is documented from pinned Lavik source and execution results."}
            </p>
          </>
        ) : null}

        {command && definition && result ? (
          <>
            <p className="document-summary">{command.summary[locale]}</p>
            <p className="manual-muted">
              {groups[definition.group][locale]} ·{" "}
              <span className="manual-badge">
                {definition.scope === "rejection-only"
                  ? zh
                    ? "拒绝行为已验证"
                    : "Rejection verified"
                  : zh
                    ? "示例已验证"
                    : "Example verified"}
              </span>
            </p>
            <h2>{zh ? "本页覆盖的语法" : "Syntax covered here"}</h2>
            <pre>
              <code>{command.syntax}</code>
            </pre>
            <div className="prose">
              <p>{command.notes[locale]}</p>
            </div>
            <h2>{zh ? "实测示例与返回值" : "Tested example & replies"}</h2>
            <p>
              {zh
                ? "下列请求按顺序执行；每个场景使用空数据库。连接先通过测试密码认证。双引号表示字符串，null 表示空回复，数组按 RESP 顺序展示。"
                : "Requests below run in order against an empty database. Each connection authenticates with the fixture password first. Quoted values are strings; null is a nil reply; arrays preserve RESP order."}
            </p>
            <pre>
              <code>{exampleTranscript(result.steps)}</code>
            </pre>
            {result.steps.some((s) => s.capture) ? (
              <p>
                {zh
                  ? "captured 标记代表前一请求返回的原始字节，不是要直接输入的字符串。二进制回复用 Base64 展示；可执行测试会原样传递字节。"
                  : "A captured marker refers to raw bytes returned by an earlier request, not a literal string to type. Binary replies are displayed as Base64; the executable test passes the original bytes unchanged."}
              </p>
            ) : null}
            <div className="manual-scope">
              {zh
                ? "验证范围：本页列出的参数形式、准备步骤和断言。示例不证明未列出的选项或部署模式；请使用自己的数据和客户端运行应用测试。"
                : "Verification scope: the argument forms, setup and assertions shown here. These examples do not establish support for unlisted options or deployment modes. Run your application tests with your data and client."}
            </div>
            <EvidenceDetails
              report={commands}
              locale={locale}
              kind="commands"
            />
            <p className="manual-sources">
              <a
                href={`https://github.com/eloqdata/lavik/blob/${release.commit}/src/redis/command_table.cpp`}
              >
                {zh ? "Lavik 命令注册源码" : "Lavik command registry"}
              </a>
              {![
                "LAVIK.HREPLACE",
                "ADDREPLICAOF",
                "TOMBRAIDER",
                "DEFRAG",
              ].includes(command.name) ? (
                <>
                  {" "}
                  ·{" "}
                  <a
                    href={`https://valkey.io/commands/${command.name.toLowerCase()}/`}
                  >
                    {zh
                      ? "Valkey 对应命令（支持范围可能不同）"
                      : "Valkey counterpart (support may differ)"}
                  </a>
                </>
              ) : null}
            </p>
          </>
        ) : null}

        {route === "docs/0.1.0/clients" ? (
          <>
            <p className="document-summary">
              {zh
                ? "使用熟悉的 Redis 或 Valkey 客户端连接 Lavik。选择语言，查看固定版本、实际验证的操作和连接配置。"
                : "Connect to Lavik with familiar Redis or Valkey clients. Choose a language, then inspect the tested version, operations and connection settings."}
            </p>
            <div className="manual-stats">
              <div>
                <strong>{new Set(clients.map((c) => c.name)).size}</strong>
                <span>{zh ? "已测试的客户端库" : "libraries tested"}</span>
              </div>
              <div>
                <strong>{new Set(clients.map((c) => c.language)).size}</strong>
                <span>{zh ? "编程语言" : "languages"}</span>
              </div>
              <div>
                <strong>{clients.length}</strong>
                <span>{zh ? "连接配置" : "connection profiles"}</span>
              </div>
            </div>
            <div className="manual-scope">
              {zh
                ? "通过表示所列版本和配置的测试成功，不代表客户端全部 API 均兼容。测试针对单机、默认用户密码认证和明文 TCP；TLS、Sentinel、集群、连接池压力和故障转移尚未验证。"
                : "Passed means the listed version and configuration passed its tests; it does not certify every client API. Tests use standalone Lavik, default-user password authentication and plaintext TCP. TLS, Sentinel, cluster routing, pool stress and failover are not verified."}
            </div>
            <div className="manual-table-scroll">
              <table className="manual-table">
                <thead>
                  <tr>
                    <th>{zh ? "语言 / 客户端" : "Language / client"}</th>
                    <th>{zh ? "版本" : "Version"}</th>
                    <th>{zh ? "配置" : "Configuration"}</th>
                    <th>{zh ? "结果" : "Result"}</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <small>{c.language}</small>
                        <br />
                        <Link href={`${root}/clients/${c.id}/`}>{c.name}</Link>
                      </td>
                      <td>{c.version}</td>
                      <td>
                        {c.protocol}
                        <br />
                        <code>{c.settings}</code>
                      </td>
                      <td>
                        <span className="manual-badge">
                          {clientResults.clients.find((r) => r.id === c.id)
                            ?.status === "passed"
                            ? zh
                              ? "通过"
                              : "Passed"
                            : zh
                              ? "未通过"
                              : "Failed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h2>{zh ? "迁移建议" : "Using these results"}</h2>
            <div className="prose">
              <p>
                {zh
                  ? "先保持表中测试过的版本和设置，再运行应用测试。valkey-go 必须设置 DisableCache: true，因为此版本 Lavik 不支持 CLIENT TRACKING。不要依赖 COMMAND INFO；该子命令在本次实测中被拒绝。"
                  : "Start with the version and settings shown, then run your application tests. Set DisableCache: true with valkey-go because this Lavik release does not implement CLIENT TRACKING. Avoid relying on COMMAND INFO, which was rejected in the command tests."}
              </p>
              <p>
                {zh
                  ? "每个客户端页面列出了实际执行的操作。部分测试使用客户端的原始命令 API；这些调用会单独标注。未列出的客户端和功能没有在此认证。"
                  : "Each client page lists the operations actually executed. Tests that use a client's raw-command API are labeled. Libraries and features absent from this matrix have not been certified here."}
              </p>
              <p>
                {zh
                  ? "ioredis 和 iovalkey 的通过配置使用 disconnect() 结束连接。单独的 quit() 诊断中，调用虽然完成，但 Node.js 进程在 12 秒后仍未退出；请查看对应客户端页面的限制说明。"
                  : "The passing ioredis and iovalkey profiles use disconnect() for cleanup. In separate quit() diagnostics, the call completed but the Node.js process remained alive after 12 seconds; see those client pages for the limitation."}
              </p>
            </div>
            <EvidenceDetails
              report={clientResults}
              locale={locale}
              kind="clients"
            />
            <p className="manual-sources">
              {zh ? "客户端目录参考" : "Client catalog reference"}:{" "}
              <a href="https://valkey.io/clients/">Valkey client libraries</a>.{" "}
              {zh
                ? "这里的兼容性结论来自对 Lavik 的独立实测。"
                : "Compatibility results here come from separate tests against Lavik."}
            </p>
          </>
        ) : null}

        {client && tested ? (
          <>
            <p className="document-summary">
              {client.language} · {client.name} {client.version} ·{" "}
              {client.protocol}
            </p>
            <p>
              <span className="manual-badge">
                {tested.status === "passed"
                  ? zh
                    ? "所列测试通过"
                    : "Listed tests passed"
                  : zh
                    ? "测试未通过"
                    : "Tests failed"}
              </span>
            </p>
            <h2>{zh ? "测试连接设置" : "Tested connection settings"}</h2>
            <p>
              <code>{client.settings}</code>
            </p>
            <p>
              {zh
                ? "测试目标：127.0.0.1:6379，用户名 default，测试密码 manual-test-only，默认数据库。该密码只用于一次性的本地测试容器。"
                : "Test target: 127.0.0.1:6379, username default, fixture password manual-test-only, default database. This password is only for the disposable local test container."}
            </p>
            <h2>{zh ? "已验证操作" : "Verified operations"}</h2>
            <ul>
              {tested.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
            <p>
              {zh
                ? "范围限于下方程序中的确切 API 调用与断言。"
                : "Coverage is limited to the exact API calls and assertions in the program below."}
            </p>
            {client.id === "valkey-go" ? (
              <div className="manual-scope">
                {zh
                  ? "必须禁用客户端缓存：DisableCache: true。Lavik 0.1.0 的 CLIENT TRACKING ON 返回不支持的子命令错误。"
                  : "Disable client-side caching with DisableCache: true. CLIENT TRACKING ON returns an unsupported-subcommand error in Lavik 0.1.0."}
              </div>
            ) : null}
            {shutdownProbe?.outcome === "timeout" ? (
              <div className="manual-scope">
                {zh
                  ? "结束连接请使用本页验证过的 disconnect()。单独诊断中的 quit() 调用已完成、操作断言也通过，但 Node.js 进程在 12 秒内未退出，因此该关闭路径未通过测试。此现象本身不能确定问题来自客户端还是服务端。完整证据包含 shutdownProbes。"
                  : "Use the tested disconnect() cleanup path. In a separate diagnostic, quit() completed and operation assertions passed, but the Node.js process did not exit within 12 seconds, so that shutdown path did not pass. This observation alone does not identify a client or server cause. The full receipt includes shutdownProbes."}
              </div>
            ) : null}
            <h2>{zh ? "可执行测试示例" : "Executable test example"}</h2>
            <p>
              {zh
                ? "此程序已在隔离 Docker 镜像中执行。它包含多个客户端分支；本页使用下面列出的参数。依赖和编译步骤位于测试目录的 Dockerfile 中。"
                : "This program ran inside the isolated Docker image. It contains multiple client branches; this page uses the arguments below. Dependencies and compilation steps are in the test directory's Dockerfile."}
            </p>
            <pre>
              <code>{client.argv.map(renderArgument).join(" ")}</code>
            </pre>
            <details>
              <summary>
                {zh
                  ? "查看已执行的完整源代码"
                  : "View the complete executed source"}
              </summary>
              <pre>
                <code>{clientSource(client)}</code>
              </pre>
            </details>
            <p className="manual-sources">
              <a href={client.source}>
                {zh ? "客户端官方仓库" : "Official client repository"}
              </a>{" "}
              ·{" "}
              <a
                href={`https://github.com/eloqdata/lavik-agent/tree/main/verification/manual/clients`}
              >
                {zh ? "依赖和复现步骤" : "Dependencies and reproduction"}
              </a>
            </p>
            <EvidenceDetails
              report={clientResults}
              locale={locale}
              kind="clients"
            />
          </>
        ) : null}
      </article>
    </main>
  );
}
