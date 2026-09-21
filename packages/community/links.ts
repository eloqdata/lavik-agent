// Public invites supplied by the workspace owner. Update here when renewed.
// The stable lavik.dev addresses do not extend the providers' invite lifetimes.
export const communityLinks = {
  slack:
    "https://join.slack.com/t/lavikcommunity/shared_invite/zt-4aie6zvxh-4xKNUZqM468uuXlobAmnkA",
  // Owner supplied this non-expiring invite on 2026-09-21.
  discord: "https://discord.gg/D9GB9w3DT6",
} as const;

export function communityRedirect(request: Request): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const path = new URL(request.url).pathname.replace(/\/$/, "");
  const channel =
    path === "/community/slack"
      ? "slack"
      : path === "/community/discord"
        ? "discord"
        : undefined;
  if (!channel) return;
  return new Response(null, {
    status: 302,
    headers: { Location: communityLinks[channel], "Cache-Control": "no-store" },
  });
}
