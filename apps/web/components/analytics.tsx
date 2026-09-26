"use client";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  resolveVisit,
  type Visit,
} from "../../../packages/marketing/attribution";
const key = "lavik.visit.v1";
const preferenceEvent = "lavik-analytics-preference";
const allowed = () => {
  if (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return false;
  try {
    return localStorage.getItem("lavik.analytics.optout") !== "true";
  } catch {
    return true;
  }
};
export function Analytics({ campaignIds }: { campaignIds: string[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [preference, setPreference] = useState(0);
  useEffect(() => {
    const changed = () => setPreference((n) => n + 1);
    window.addEventListener(preferenceEvent, changed);
    window.addEventListener("storage", changed);
    return () => {
      window.removeEventListener(preferenceEvent, changed);
      window.removeEventListener("storage", changed);
    };
  }, []);
  useEffect(() => {
    if (location.hostname !== "lavik.dev" || !allowed()) {
      try {
        sessionStorage.removeItem(key);
      } catch {}
      return;
    }
    let previous: Visit | undefined;
    try {
      if (localStorage.getItem("lavik.analytics.optout") === "true") return;
      previous = JSON.parse(sessionStorage.getItem(key) || "null") ?? undefined;
    } catch {
      /* Storage may be unavailable. Count this page without linking visits. */
    }
    if (
      previous &&
      (typeof previous.updatedAt !== "number" ||
        !Array.isArray(previous.events) ||
        typeof previous.visibleSeconds !== "number")
    )
      previous = undefined;
    const resolved = resolveVisit(
      location.href,
      document.referrer,
      previous,
      Date.now(),
      campaignIds,
    );
    let visit = resolved.visit;
    const save = () => {
      if (!allowed()) return;
      try {
        sessionStorage.setItem(key, JSON.stringify(visit));
      } catch {}
    };
    const send = (event: string, once = false) => {
      if (!allowed()) return;
      if (once && visit.events.includes(event)) return;
      if (once) visit.events.push(event);
      visit.updatedAt = Date.now();
      save();
      const body = JSON.stringify({
        event,
        path: pathname,
        source: visit.source,
        medium: visit.medium,
        campaign: visit.campaign,
      });
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "omit",
      }).catch(() => {});
    };
    save();
    if (resolved.started) send("visit");
    send("pageview");
    if (
      /\/docs\/0\.1\.0\/(quick-start|install-packages|install-docker|install-docker-compose)\/$/.test(
        pathname,
      )
    )
      send("install", true);
    const timer = window.setInterval(() => {
      if (
        !allowed() ||
        document.visibilityState !== "visible" ||
        visit.events.includes("engaged")
      )
        return;
      visit.visibleSeconds += 1;
      save();
      if (visit.visibleSeconds >= 20) send("engaged", true);
    }, 1000);
    const click = (e: MouseEvent) => {
      const anchor = (e.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const url = new URL(anchor.href);
      if (
        (url.hostname === "github.com" &&
          /\/eloqdata\/lavik\/releases\/download\//.test(url.pathname) &&
          !/\.(sha256|txt)$/.test(url.pathname)) ||
        url.hostname === "hub.docker.com"
      )
        send("download", true);
      else if (
        url.hostname === "github.com" &&
        url.pathname.startsWith("/eloqdata/lavik")
      )
        send("github", true);
      else if (
        ["discord.gg", "join.slack.com"].includes(url.hostname) ||
        (url.hostname === location.hostname &&
          url.pathname.startsWith("/community/"))
      )
        send("community", true);
    };
    document.addEventListener("click", click);
    return () => {
      clearInterval(timer);
      document.removeEventListener("click", click);
    };
  }, [pathname, search, preference, campaignIds]);
  return null;
}
export function AnalyticsPreference() {
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      setDisabled(localStorage.getItem("lavik.analytics.optout") === "true");
    } catch {
      setError(true);
    }
  }, []);
  return (
    <>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          try {
            localStorage.setItem("lavik.analytics.optout", String(!disabled));
            sessionStorage.removeItem(key);
            window.dispatchEvent(new Event(preferenceEvent));
            setDisabled(!disabled);
          } catch {
            setError(true);
          }
        }}
      >
        {disabled
          ? "Enable analytics / 启用统计"
          : "Disable analytics / 退出统计"}
      </button>
      {error && (
        <p>
          Browser storage is unavailable. Use Do Not Track or Global Privacy
          Control to opt out. / 浏览器存储不可用，请通过 Do Not Track 或 Global
          Privacy Control 退出统计。
        </p>
      )}
    </>
  );
}
