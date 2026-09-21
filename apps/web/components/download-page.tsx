import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { release } from "../../../packages/content/repository";
import {
  downloadPackages,
  downloadRelease,
} from "../../../packages/content/downloads";
import { CopyCode } from "./copy-code";

export function DownloadPage({ locale }: { locale: Locale }) {
  const zh = locale === "zh-CN";
  const source = `https://github.com/eloqdata/lavik/blob/${release.commit}`;
  return (
    <main id="main" className="container wide-page resource-page">
      <p className="eyebrow">LAVIK / {zh ? "下载" : "DOWNLOAD"}</p>
      <h1>{zh ? "让 Lavik 跑起来。" : "Put Lavik to work."}</h1>
      <p className="page-lead">
        {zh
          ? "选择适合你机器的 Linux 发布包，验证校验和，然后运行第一组命令。Apache 2.0 开源，免费使用。"
          : "Choose a Linux package for your machine, verify the checksum, and run your first commands. Free to use, open source under Apache 2.0."}
      </p>
      <div className="release-banner">
        <div>
          <span className="eyebrow">
            {zh ? "当前发布版本" : "CURRENT RELEASE"}
          </span>
          <h2>
            {release.tag} <span className="status-pill">Beta</span>
          </h2>
          <p>
            {zh ? "发布于" : "Released"}{" "}
            {downloadRelease.published_at.slice(0, 10)}
          </p>
        </div>
        <div className="button-row">
          <Link className="button" href={`/${locale}/docs/0.1.0/quick-start/`}>
            {zh ? "快速开始" : "Quick start"} →
          </Link>
          <a className="button secondary" href={downloadRelease.html_url}>
            {zh ? "GitHub 发布说明" : "GitHub release notes"} ↗
          </a>
        </div>
      </div>
      <section className="download-requirements" aria-labelledby="requirements">
        <h2 id="requirements">{zh ? "下载之前" : "Before you download"}</h2>
        <p>
          {zh
            ? "所有预编译包均要求 Linux 6.1+、可用的 io_uring 和兼容 Ubuntu 24.04 的 glibc；即使选择 SPDK / DPDK，也需要 io_uring。"
            : "All prebuilt packages require Linux 6.1+, usable io_uring, and Ubuntu 24.04-compatible glibc, including deployments using SPDK / DPDK."}
        </p>
        <p>
          {zh
            ? "macOS / Windows：这些是 Linux 二进制文件。请在满足上述要求的 Linux 虚拟机或 Docker Linux 环境中评估。"
            : "On macOS or Windows, use a Linux VM or Docker Linux environment meeting those requirements. These are Linux binaries."}
        </p>
        <a
          className="text-link"
          href={`${source}/README.md#release-hardware-and-platform-requirements`}
        >
          {zh
            ? "完整硬件与平台要求"
            : "Full hardware and platform requirements"}{" "}
          ↗
        </a>
      </section>
      {(["minimal", "standard"] as const).map((variant) => (
        <section
          className="download-section"
          key={variant}
          aria-labelledby={`variant-${variant}`}
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {variant === "minimal"
                  ? zh
                    ? "从这里开始"
                    : "START HERE"
                  : zh
                    ? "启用 SPDK / DPDK"
                    : "FOR SPDK / DPDK"}
              </p>
              <h2 id={`variant-${variant}`}>
                {variant === "minimal" ? "Minimal" : "Standard"}
              </h2>
            </div>
          </div>
          <p className="section-description">
            {variant === "minimal"
              ? zh
                ? "内核 TCP / io_uring，使用编译器默认 CPU 目标。适合快速开始，也用于本站的本地 Docker 命令与客户端验证。"
                : "Kernel TCP / io_uring with compiler-default CPU targets. Use this for the quick start; it is also the package variant used for this site's local Docker command and client checks."
              : zh
                ? "包含 DPDK 网络和 SPDK 存储支持。要求 x86-64-v2 或 ARMv8-A + CRC32，以及 NUMA / UUID 运行库。默认使用内核 TCP / io_uring；需单独配置并显式启用 DPDK / SPDK。"
                : "Includes DPDK networking and SPDK storage. Requires x86-64-v2 or ARMv8-A + CRC32, plus NUMA / UUID runtime libraries. Defaults to kernel TCP / io_uring; provision and explicitly select DPDK / SPDK to use them."}
          </p>
          <div className="download-grid">
            {downloadPackages
              .filter((p) => p.variant === variant)
              .map((pkg) => (
                <article className="download-card" key={pkg.filename}>
                  <div className="card-topline">
                    <span>Linux</span>
                    <span>{(pkg.size / 1024 / 1024).toFixed(1)} MiB</span>
                  </div>
                  <h3>{pkg.arch === "x86_64" ? "x86-64" : "ARM64"}</h3>
                  <p className="architecture-label">
                    {pkg.arch === "x86_64"
                      ? "AMD / Intel · x86_64"
                      : "AArch64 · aarch64"}
                  </p>
                  <a className="button" href={pkg.url}>
                    {zh ? "下载" : "Download"}{" "}
                    {variant === "minimal" ? "Minimal" : "Standard"} ↓
                  </a>
                  <p className="download-filename">{pkg.filename}</p>
                  <details>
                    <summary>
                      {zh
                        ? "SHA-256 与安装命令"
                        : "SHA-256 & installation commands"}
                    </summary>
                    <p>
                      <a className="text-link" href={pkg.checksumUrl}>
                        {zh ? "下载校验和文件" : "Download checksum file"} ↗
                      </a>
                    </p>
                    <code className="checksum-value">{pkg.sha256}</code>
                    <CopyCode locale={locale} code={pkg.commands} />
                    <Link
                      className="text-link"
                      href={`/${locale}/docs/0.1.0/quick-start/`}
                    >
                      {zh
                        ? "下一步：启动并连接 Lavik"
                        : "Next: start and connect to Lavik"}{" "}
                      →
                    </Link>
                  </details>
                </article>
              ))}
          </div>
        </section>
      ))}
      <section className="resource-next">
        <div>
          <h2>{zh ? "从源码构建" : "Build from source"}</h2>
          <p>
            {zh
              ? "使用固定版本的构建指南了解依赖项与 CPU 优化。该指南中的构建流程不属于本站本地命令与客户端测试的验证范围。"
              : "Use the pinned build guide for dependencies and CPU-specific optimizations. Its build procedures are outside this site's local command and client verification."}
          </p>
        </div>
        <a
          className="text-link"
          href={`${source}/docs/operations/building-and-packaging.md`}
        >
          {zh ? "构建与打包指南" : "Building and packaging"} ↗
        </a>
      </section>
    </main>
  );
}
