import Link from "next/link";
import type { Locale } from "../../../packages/content/schema";
import { release } from "../../../packages/content/repository";
import { requireReviewedManual } from "../../../packages/manual/gate";
import {
  quickStartDependencies,
  quickStartPackages,
} from "../../../packages/quick-start/content";
import { QuickStartInstaller } from "./quick-start-installer";
import "./quick-start.css";

export function QuickStartSetup({ locale }: { locale: Locale }) {
  requireReviewedManual();
  const zh = locale === "zh-CN";
  return (
    <div className="prose quick-start-setup">
      <p>
        {zh
          ? "使用 Linux 6.1+，确保 io_uring 可用，并使用兼容 Ubuntu 24.04 的 glibc。macOS 和 Windows 用户请在满足这些条件的 Linux 虚拟机中运行；发布包不能直接在 macOS 上执行。"
          : "Use Linux 6.1+ with usable io_uring and Ubuntu 24.04-compatible glibc. On macOS or Windows, run the package in a Linux VM meeting these requirements; the Linux binaries do not run directly on macOS."}
      </p>
      <p>
        <Link href={`/${locale}/download/`}>
          {zh
            ? "查看所有发布包、SHA-256 校验和及平台要求"
            : "All packages, SHA-256 checksums, and platform requirements"}{" "}
          →
        </Link>
      </p>
      <QuickStartInstaller
        locale={locale}
        packages={quickStartPackages}
        dependencies={quickStartDependencies}
      />
      <details className="quick-start-spdk">
        <summary>
          {zh
            ? "准备使用 Standard 的 SPDK 存储？"
            : "Planning to use Standard with SPDK storage?"}
        </summary>
        <p>
          {zh
            ? "先用下方文件式示例验证客户端连接。Minimal 和 Standard 在这个示例中都使用内核 TCP / io_uring。"
            : "Start with the file-backed example below to verify your client connection. Both packages use kernel TCP / io_uring in this example."}
        </p>
        <p>
          {zh
            ? "SPDK 需要独立配置的 NVMe 命名空间、IOMMU / VFIO、hugepages 和足够的 memlock 限额。Standard 支持 --storage=spdk，数据路径使用 spdk://PCI_BDF/NSID，而不是普通文件。SPDK 存储可以继续使用内核 TCP，无需同时启用 DPDK 网络。"
            : "SPDK requires a separately provisioned NVMe namespace, IOMMU / VFIO, hugepages, and sufficient locked-memory limits. Standard supports --storage=spdk with spdk://PCI_BDF/NSID data paths instead of a regular file. You can keep kernel TCP networking while using SPDK storage; DPDK networking is optional."}
        </p>
        <p>
          {zh
            ? "仅使用专门用于 Lavik 的空设备：设备解绑会影响内核对该设备的访问，启动数据库会写入数据。"
            : "Use an empty device dedicated to Lavik: rebinding changes kernel access to that device, and starting the database writes to it."}
        </p>
        <a
          href={`https://github.com/eloqdata/lavik/blob/${release.commit}/docs/operations/building-and-packaging.md#runtime-backend-selection`}
        >
          {zh
            ? "查看此版本的 SPDK 后端选择与运行要求"
            : "SPDK backend selection and runtime requirements for this release"}{" "}
          ↗
        </a>
      </details>
    </div>
  );
}
