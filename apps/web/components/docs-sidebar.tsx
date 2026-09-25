import type { Locale } from "../../../packages/content/schema";
import {
  articles,
  articlePath,
  release,
} from "../../../packages/content/repository";
import {
  manualCatalog,
  manualClients,
} from "../../../packages/manual/repository";
import { DocsNavigation, type DocLink } from "./docs-navigation";
import { operationsGuides } from "../../../packages/operations/repository";

export function DocsSidebar({
  locale,
  route,
}: {
  locale: Locale;
  route: string;
}) {
  const zh = locale === "zh-CN";
  const root = `/${locale}/docs/0.1.0`;
  const groups = [
    {
      title: zh ? "开始使用" : "Get started",
      links: [
        { title: zh ? "文档首页" : "Documentation home", href: `${root}/` },
        { title: zh ? "Lavik 概览" : "About Lavik", href: `${root}/overview/` },
        {
          title: zh ? "下载与安装" : "Download & install",
          href: `/${locale}/download/`,
        },
        {
          title: zh ? "快速开始" : "Quick start",
          href: `${root}/quick-start/`,
        },
      ],
    },
    {
      title: zh ? "部署与运维" : "Deploy & operate",
      links: operationsGuides.map((g) => ({
        title:
          g.layout === "single"
            ? zh
              ? "lavik-ctl：单节点"
              : "lavik-ctl: single node"
            : zh
              ? "lavik-ctl：主从 HA"
              : "lavik-ctl: primary–follower HA",
        href: `${root}/${g.id}/`,
      })),
    },
    {
      title: zh ? "使用 Lavik" : "Build with Lavik",
      links: [
        {
          title: zh ? "命令参考" : "Command reference",
          href: `${root}/commands/`,
        },
        {
          title: zh ? "客户端库" : "Client libraries",
          href: `${root}/clients/`,
        },
        {
          title: zh ? "兼容性概览" : "Compatibility overview",
          href: `${root}/compatibility/`,
        },
      ],
    },
    {
      title: zh ? "理解与评估" : "Understand & evaluate",
      links: [
        {
          title: zh ? "存储与持久化" : "Storage & durability",
          href: `${root}/storage/`,
        },
        {
          title: zh ? "基准测试" : "Benchmarks",
          href: `/${locale}/benchmarks/`,
        },
        {
          title: zh ? "评估常见问题" : "Evaluation FAQ",
          href: `/${locale}/faq/evaluation/`,
        },
        {
          title: zh ? "版本说明" : "Release notes",
          href: `/${locale}/releases/`,
        },
        {
          title: zh ? "社区与帮助" : "Community & help",
          href: `/${locale}/community/`,
        },
      ],
    },
  ];
  const indexed = new Map<string, DocLink>();
  for (const group of groups)
    for (const link of group.links)
      indexed.set(link.href, { ...link, kind: group.title });
  for (const guide of operationsGuides) {
    const href = `${root}/${guide.id}/`;
    indexed.set(href, {
      title: guide.title[locale],
      href,
      keywords: `${guide.summary[locale]} Grafana Prometheus ${guide.sections.map((s) => s.title[locale]).join(" ")}`,
      kind: zh ? "部署与运维" : "Deploy & operate",
    });
  }
  for (const article of articles().filter(
    (a) => a.locale === locale && (a.kind === "docs" || a.kind === "faq"),
  )) {
    const href = articlePath(article);
    indexed.set(href, {
      title: indexed.get(href)?.title ?? article.title,
      href,
      keywords: `${article.title} ${article.summary}`,
      kind: zh ? "指南" : "Guide",
    });
  }
  for (const command of manualCatalog().commands) {
    const href = `${root}/commands/${command.name.toLowerCase()}/`;
    indexed.set(href, {
      title: command.name,
      href,
      keywords: `${command.syntax} ${command.summary[locale]}`,
      kind: zh ? "命令" : "Command",
    });
  }
  for (const client of manualClients()) {
    const href = `${root}/clients/${client.id}/`;
    indexed.set(href, {
      title: client.name,
      href,
      keywords: `${client.id} ${client.language}`,
      kind: zh ? "客户端" : "Client",
    });
  }
  return (
    <aside className="document-nav docs-sidebar">
      <div className="docs-sidebar-inner">
        <span className="eyebrow">LAVIK DOCS</span>
        <span className="doc-version">
          0.1.0 <span className="status-pill">Beta</span>
          <small>{release.tag}</small>
        </span>
        <DocsNavigation
          locale={locale}
          route={route}
          groups={groups}
          entries={[...indexed.values()]}
        />
      </div>
    </aside>
  );
}
