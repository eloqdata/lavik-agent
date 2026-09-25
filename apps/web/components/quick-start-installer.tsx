"use client";
import { useState } from "react";
import type { Locale } from "../../../packages/content/schema";
import { CopyCode } from "./copy-code";

export function QuickStartInstaller({
  locale,
  packages,
  dependencies,
}: {
  locale: Locale;
  packages: {
    arch: string;
    variant: string;
    directory: string;
    commands: string;
  }[];
  dependencies: { minimal: string; standard: string };
}) {
  const zh = locale === "zh-CN";
  const [variant, setVariant] = useState<"minimal" | "standard">("minimal");
  const [arch, setArch] = useState("x86_64");
  const selected = packages.find(
    (p) => p.variant === variant && p.arch === arch,
  )!;
  return (
    <section className="quick-start-install" aria-labelledby="install-heading">
      <h2 id="install-heading">
        {zh ? "1. 选择并下载软件包" : "1. Choose and download a package"}
      </h2>
      <div className="quick-start-options">
        <label>
          {zh ? "发布包" : "Package"}
          <select
            value={variant}
            onChange={(e) =>
              setVariant(e.target.value as "minimal" | "standard")
            }
          >
            <option value="minimal">Minimal</option>
            <option value="standard">Standard · SPDK / DPDK</option>
          </select>
        </label>
        <label>
          {zh ? "Linux 机器的 CPU 架构" : "Your Linux machine’s CPU"}
          <select value={arch} onChange={(e) => setArch(e.target.value)}>
            <option value="x86_64">x86-64 · AMD / Intel</option>
            <option value="aarch64">ARM64 · AArch64</option>
          </select>
        </label>
      </div>
      <p>
        {variant === "minimal"
          ? zh
            ? "Minimal 是最简单的入门选择，使用内核 TCP 和 io_uring 存储，不包含 SPDK / DPDK。"
            : "Minimal is the simplest starting point: kernel TCP and io_uring storage, without SPDK / DPDK."
          : zh
            ? "Standard 包含 SPDK / DPDK，也支持下方完全相同的文件式启动示例。安装 Standard 不会自动启用 SPDK。CPU 需支持 x86-64-v2 或 ARMv8-A + CRC32。"
            : "Standard includes SPDK / DPDK and also runs the same file-backed example below. Installing Standard does not automatically enable SPDK. Its CPU target is x86-64-v2 or ARMv8-A + CRC32."}
      </p>
      <h3>
        {zh
          ? "安装客户端和运行依赖（Ubuntu 24.04）"
          : "Install the client and dependencies (Ubuntu 24.04)"}
      </h3>
      <CopyCode locale={locale} code={dependencies[variant]} />
      <h3>
        {zh
          ? "下载、校验并进入软件包目录"
          : "Download, verify, and enter the package directory"}
      </h3>
      <p>
        {zh
          ? "在 Bash 终端中执行。校验失败时，后续命令不会执行。如果已从下载页解压此包，只需进入下方目录。"
          : "Run this in a Bash terminal. The commands stop if a checksum check fails. If you already extracted this package from the Download page, enter the directory shown below."}
      </p>
      <CopyCode locale={locale} code={selected.commands} />
      <p className="quick-start-directory">
        {zh ? "当前目录应为" : "Your current directory should now be"}:{" "}
        <code>{selected.directory}</code>
      </p>
      <p>
        {zh
          ? "版本输出应为 lavik 0.1.0-beta.1。保持这个终端位于该目录，继续下面的启动步骤。"
          : "Expect lavik 0.1.0-beta.1. Keep this terminal in that directory for the startup step below."}
      </p>
    </section>
  );
}
