# Community links

Public, stable addresses:

- https://lavik.dev/en/community/ (English community page)
- https://lavik.dev/zh-CN/community/ (Chinese community page)
- https://lavik.dev/community/discord/ (current Discord invite)
- https://lavik.dev/community/slack/ (current Slack invite)

The Cloudflare Worker returns temporary, non-cached redirects for the last two addresses. Update `packages/community/links.ts` and push to main to change a destination. A redirect keeps our public address stable; it does not change a provider's expiration or use limits. Both communities are named **Lavik Community**.

## Discord

On September 21, 2026, the owner supplied `https://discord.gg/D9GB9w3DT6` and confirmed it does not expire. It is the current configured invite. Revoking an invite, pausing invitations, or deleting the server can still prevent joining.

For a replacement: Server Settings → Enable Community → Get Started if Community is not enabled. Open a public channel → Create Invite → Edit invite link → Expire After: Never → Max Uses: No limit → Generate a New Link. Do not grant temporary membership for the public community invite. See [Discord Invites 101](https://support.discord.com/hc/en-us/articles/208866998-Invites-101).

## Slack

Slack's current documentation says invitations and invite links expire after 30 days. Do not promise a permanent shared invite or treat the workspace sign-in URL as a way for new members to join.

As workspace owner/admin, open Slack on desktop → Admin → Workspace settings → People → Invitations → Invite links. Renew an expired link there, or create a new shared invite from Invite people → Copy invite link. If the URL changes, update `communityLinks.slack` and push. Check it before the 30-day expiration; the exact creation date of the supplied invite is not recorded here. No automatic Slack renewal is configured.

Members who already joined can sign in at https://lavikcommunity.slack.com/ without another invitation. The community page also links to a GitHub issue form for visitors to report an expired invitation.

Source: [Slack: Manage pending invitations and invite links](https://slack.com/help/articles/360060363633-Manage-pending-invitations-and-invite-links-for-your-workspace).

For the lowest maintenance, share the non-expiring Discord invite through the stable Lavik address, while keeping Slack available for those who prefer it.
