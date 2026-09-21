"use client";
import { useState } from "react";
import Link from "next/link";

export function CommandSearch({
  locale,
  commands,
  groups,
}: {
  locale: "en" | "zh-CN";
  commands: { name: string; group: string; summary: string; scope: string }[];
  groups: Record<string, string>;
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const zh = locale === "zh-CN";
  const visible = commands.filter(
    (c) =>
      (!group || c.group === group) &&
      `${c.name} ${c.summary}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  return (
    <>
      <div className="command-filters">
        <label>
          {zh ? "搜索命令" : "Find a command"}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="GET, HSET, XREAD…"
          />
        </label>
        <label>
          {zh ? "类别" : "Category"}
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="">{zh ? "所有类别" : "All categories"}</option>
            {Object.entries(groups).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="manual-muted" aria-live="polite">
        {visible.length} / {commands.length} {zh ? "个命令" : "commands"}
      </p>
      <div className="command-list">
        {visible.map((command) => (
          <Link
            key={command.name}
            href={`/${locale}/docs/0.1.0/commands/${command.name.toLowerCase()}/`}
          >
            <div>
              <strong>{command.name}</strong>
              <span>{groups[command.group]}</span>
            </div>
            <p>{command.summary}</p>
            {command.scope === "rejection-only" ? (
              <small>
                {zh ? "仅验证拒绝行为" : "Rejection behavior tested"}
              </small>
            ) : null}
          </Link>
        ))}
      </div>
      {!visible.length ? (
        <p>
          {zh
            ? "没有匹配项。请尝试其他命令名称。"
            : "No matches. Try another command name."}
        </p>
      ) : null}
    </>
  );
}
