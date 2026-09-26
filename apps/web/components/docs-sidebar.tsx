import { userGuides } from "../../../packages/docs/repository";
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
      title: zh ? "开始使用" : "Get Started",
      links: [
        { title: zh ? "文档首页" : "Documentation Home", href: `${root}/` },
        { title: zh ? "Lavik 概览" : "About Lavik", href: `${root}/overview/` },
        {
          title: zh ? "使用二进制安装" : "Install With Binary",
          href: `${root}/quick-start/`,
        },
        {
          title: zh ? "使用 Docker 安装" : "Install With Docker",
          href: `${root}/install-docker/`,
        },
        {
          title: zh
            ? "使用 Docker Compose 安装"
            : "Install With Docker Compose",
          href: `${root}/install-docker-compose/`,
        },
      ],
    },
    {
      title: zh ? "使用 Lavik 开发" : "Build With Lavik",
      links: [
        {
          title: zh ? "命令参考" : "Command Reference",
          href: `${root}/commands/`,
        },
        { title: zh ? "客户端库" : "Client Library", href: `${root}/clients/` },
        {
          title: zh ? "兼容性概览" : "Compatibility Overview",
          href: `${root}/compatibility/`,
        },
      ],
    },
    {
      title: zh ? "管理 Lavik" : "Managing Lavik",
      links: [
        {
          title: zh ? "单节点部署" : "Single Node",
          href: `${root}/lavik-ctl-single-node/`,
        },
        {
          title: zh ? "主从高可用" : "Primary–Follower HA",
          href: `${root}/lavik-ctl-ha-cluster/`,
        },
        {
          title: zh ? "监控与 Grafana" : "Monitoring & Grafana",
          href: `${root}/lavik-ctl-ha-cluster/#monitoring`,
        },
      ],
    },
    {
      title: zh ? "迁移到 Lavik" : "Migrating To Lavik",
      links: [
        {
          title: zh ? "从 Redis 迁移" : "From Redis",
          href: `${root}/migrate-redis/`,
        },
        {
          title: zh ? "从 Redis Cluster 迁移" : "From Redis Cluster",
          href: `${root}/migrate-redis-cluster/`,
        },
      ],
    },
    {
      title: zh ? "理解与评估" : "Understand & Evaluate",
      links: [
        {
          title: zh ? "存储与持久化" : "Storage & Durability",
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
          title: zh ? "版本说明" : "Release Notes",
          href: `/${locale}/releases/`,
        },
        {
          title: zh ? "社区与帮助" : "Community & Help",
          href: `/${locale}/community/`,
        },
      ],
    },
  ];
  const indexed = new Map<string, DocLink>();
  for (const group of groups)
    for (const link of group.links)
      indexed.set(link.href, { ...link, kind: group.title });
  for (const guide of [...operationsGuides, ...userGuides]) {
    const href = `${root}/${guide.id}/`;
    indexed.set(href, {
      title: indexed.get(href)?.title ?? guide.title[locale],
      href,
      keywords: `${guide.summary[locale]} Grafana Prometheus ${guide.sections.map((s) => s.title[locale]).join(" ")}`,
      kind: indexed.get(href)?.kind ?? (zh ? "指南" : "Guide"),
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
