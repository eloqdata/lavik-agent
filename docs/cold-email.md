# Cold email in Lavik Marketing

The private console at https://marketing.lavik.dev/ has a **Cold email** tab.
Contacts and email jobs live in Neon PostgreSQL, in the dedicated `lavik_email`
schema. The existing admin account controls access. Contacts never appear in
public website assets, model prompts, or traffic events.

## Start a job

1. Open Cold email → Mailbox settings. Connect Outlook using the steps below,
   choose the mailbox-wide rate limits. The mailing-address field is optional.
2. Search contacts by name/email and exact email domain. The imported CRM fields
   contain names and addresses; they do not verify job title or current interest.
3. Create a draft, choose a published landing page, installation guide, download
   page or article, then set the audience and maximum recipients (1–1,000).
4. Write a subject and plain-text message for A, and optionally B. Supported
   substitutions are `{{first_name}}`, `{{last_name}}`, `{{link}}`, and
   `{{unsubscribe}}`. Each variant must contain `{{link}}`. Missing first names
   become “there”. A signature and unsubscribe link are appended, together with
   the mailing address if provided.
5. Save and preview. The preview uses fictional Alex Example; it sends no email.
   Enable scheduled sending, then Start job. An optional date/time delays its
   earliest send; all rate limits still apply. The browser shows local time.
6. The recipient snapshot and variants are frozen when started. A/B cohorts use
   a stable randomized ordering, approximately 50/50, with one variant per contact.
   Edit drafts freely; clone a started job to test new subject/body combinations.
7. Pause/resume individual jobs, cancel pending work, or turn off all sending.
   An already in-flight message can complete after a pause or unsubscribe.

Cloudflare's minute cron runs without the Mac. PostgreSQL serializes claims across
all jobs using a locked mailbox-settings row. Defaults: **50 attempts per rolling
24 hours, at least 120 seconds apart**. Configurable bounds: 1–500 attempts/day,
60–86,400 seconds apart. Attempts include provider rejections and throttle retries.
Microsoft can enforce lower limits; regular Outlook activity shares its allowance.

## Microsoft Outlook setup

This integration sends only as **hubertzhang@eloqdata.com** through Microsoft Graph.
It uses application authentication so an interactive browser session is not needed.
An EloqData Microsoft 365/Exchange administrator must perform the following setup.

1. In https://entra.microsoft.com → **Identity → Applications → App registrations
   → New registration**, name the app `Lavik Marketing`, select **Accounts in this
   organizational directory only**, and register. No redirect URI is needed.
2. Copy **Application (client) ID** and **Directory (tenant) ID**. Under
   **Certificates & secrets → Client secrets → New client secret**, create a
   credential and copy its **Value**, not its secret ID. Set an expiry reminder.
3. Find the app under **Enterprise applications** and copy its **Object ID**.
   This is the service principal's object ID, not the App registrations object ID.
4. Grant only scoped `Application Mail.Send` through Exchange Online Application
   RBAC. Do not additionally grant tenant-wide Entra `Mail.Send`: Entra and RBAC
   permissions are additive, so a broad Entra grant defeats the mailbox scope.
   In Exchange Online PowerShell, substitute your two IDs:

   ```powershell
   Connect-ExchangeOnline
   New-ServicePrincipal -AppId "YOUR_CLIENT_ID" -ObjectId "YOUR_ENTERPRISE_APP_OBJECT_ID" -DisplayName "Lavik Marketing"
   New-ManagementScope -Name "LavikMarketingMailbox" -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'hubertzhang@eloqdata.com'"
   New-ManagementRoleAssignment -Name "LavikMarketingSend" -App "YOUR_ENTERPRISE_APP_OBJECT_ID" -Role "Application Mail.Send" -CustomResourceScope "LavikMarketingMailbox"
   Test-ServicePrincipalAuthorization -Identity "YOUR_ENTERPRISE_APP_OBJECT_ID" -Resource "hubertzhang@eloqdata.com"
   ```

   Confirm `InScope` is true for this mailbox, and false for another mailbox.
   Exchange permission changes can take time to propagate.

5. Save the following in the ignored repository-root `.outlook` file:

   ```dotenv
   OUTLOOK_TENANT_ID=your-directory-tenant-id
   OUTLOOK_CLIENT_ID=your-application-client-id
   OUTLOOK_CLIENT_SECRET=your-secret-value
   ```

6. Install the credentials in the Cloudflare marketing Worker:

   ```bash
   node --import tsx scripts/email/setup-cloudflare.ts outlook
   ```

   This uses authenticated Wrangler and passes values through stdin. It does not
   read `.env`, use Azure model keys, or put secrets in GitHub or the browser.

7. Manage sending from the console. Begin with a small, relevant audience
   and inspect Sent Items and delivery failures before increasing the rate.
   Configure the sender domain's SPF, DKIM and DMARC with the Microsoft 365 admin.

The connection indicator means credentials are configured, not that mailbox
permission has been verified. A token failure or Graph 401/403 disables sending
and displays a configuration error. Fix the credentials/permissions and re-enable.

Microsoft documents mailbox recipient limits, a **30 messages/minute** message
rate limit, and tenant-level external-recipient limits. These are ceilings, not a
recommended cold-email volume. Exchange Online is not a large bulk-mail platform;
this integration deliberately uses small selected audiences and conservative caps.
For high-volume campaigns, add a suitable email provider through the sender adapter
instead of multiplying Outlook accounts to evade its limits.

Sources:

- [Exchange Online limits](https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits)
- [Outbound sending limits](https://learn.microsoft.com/en-us/defender-office-365/outbound-spam-sending-limits-troubleshoot)
- [Exchange Application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)
- [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0)
- [Graph throttling](https://learn.microsoft.com/en-us/graph/throttling)

## Status, unsubscribes and retries

- `pending`: queued, possibly waiting for its schedule, interval or daily cap.
- `sending`: a durable claim was made before contacting Graph.
- `accepted`: Graph returned 202. This does **not** confirm delivery or an open.
- `unknown`: the connection failed, Graph returned an ambiguous response, or a
  worker stopped during a send. No automatic retry: inspect Outlook Sent Items.
- `rejected`: Graph definitively rejected the message, or repeated throttling
  reached the five-attempt limit.
- `suppressed`: opted out, archived, or contacted within the previous 30 days.
- `replied` / `bounced`: manually recorded from Outlook, with global suppression.

Graph 429 responses honor `Retry-After` (seconds or HTTP date) with a mailbox-wide
cooldown. Other ambiguous outcomes are never automatically replayed: Graph sendMail
has no exactly-once guarantee. An interrupted send becomes unknown after ten minutes.

Every email includes a personalized opaque unsubscribe URL. A GET shows a
confirmation form; it does not unsubscribe on link-scanner previews. POST applies
suppression immediately. RFC 8058 one-click headers are included in the MIME mail.
There are no email addresses in analytics tags or tracking URLs.

This version requests **Mail.Send only**: it does not read the mailbox. Monitor
Outlook for bounces, replies and complaints. Use “Mark bounced”, “Mark replied”, or
“Suppress” in the console to exclude those addresses from future jobs. Imported
CRM opt-outs and hard-bounce flags are retained. Reimporting cannot undo a suppression.

## A/B attribution and weekly reports

Starting a job creates an existing Lavik share link for each variant:

- public link: `https://lavik.dev/go/<opaque-link-id>`;
- `utm_source=email`, `utm_medium=email`;
- `utm_campaign=<selected website campaign>`;
- `utm_content=em-<job UUID without hyphens>-a` (or `-b`).

The job ID is a **placement dimension**, preserving the existing registered
campaign system. Placement labels show the job name and variant. Compare variants
in Cold email (last 30 days) or Overview (custom dates), filtering platform **Email**
and the corresponding placements. Existing weekly reports and placement CSV exports
include the same breakdown automatically. No rebuild is required to register a job.

The destination page records browser visits, engaged visits and installation,
download, GitHub and community interactions under the existing privacy controls.
The redirect itself does not count as a visit. Metrics are sessions/events, not
unique recipients; security scanners, forwarding, attribution expiry and analytics
opt-out can affect them. No open pixels are used. Do not call visits/accepted emails
a measured unique click-through rate or infer an A/B winner from tiny samples.

## Import and operations

The root `contacts.jsonl`, `.neon` and `.outlook` are ignored by Git.

```bash
node --import tsx scripts/email/migrate.ts
node --import tsx scripts/email/import.ts
node --import tsx scripts/email/setup-cloudflare.ts database
```

`.neon` contains the supplied PostgreSQL URL. Migration creates only `lavik_email`.
Import streams JSONL, normalizes/deduplicates email addresses, and upserts in bounded
transactions. It prints only counts. Restarting is safe. It preserves source IDs,
names, domains, source modification dates and archive state; it does not copy the
entire raw CRM record. The import digest and aggregate counts are stored in Neon.

Credential setup uses Cloudflare secrets. Database parameters use bound SQL, and
private API routes require the existing authenticated admin session, same-origin
JSON and a CSRF token. Public unsubscribe links are unguessable bearer capabilities.
Both console and unsubscribe pages are noindex and no-store. Runtime errors do not
log contact records, Graph response bodies, SQL parameters, or connection strings.

GitHub CI runs unit checks, PostgreSQL concurrency/queue tests, browser checks and
live deployment verification. PostgreSQL tests use a disposable CI database; no
real contacts or Microsoft credentials are available to CI. Website tests/builds
are not run on the local Mac.
