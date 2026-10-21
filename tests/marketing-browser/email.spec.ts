import { test, expect } from "@playwright/test";
test("email workspace supports draft A/B editing, previews, lifecycle and mobile layout without sending mail", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const jobs: any[] = [];
  let settings = {
    enabled: false,
    postal_address: "",
    daily_limit: 50,
    interval_seconds: 120,
  };
  const now = new Date().toISOString(),
    id = "11111111-1111-4111-8111-111111111111";
  await page.route("**/api/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      p = url.pathname.slice(5);
    let data: unknown = {},
      status = 200;
    if (p === "session")
      data = { user: "admin", mustChangePassword: false, csrf: "fixture" };
    else if (p === "placements") data = { placements: [] };
    else if (p === "links") data = { links: [] };
    else if (p === "catalogue")
      data = {
        articles: [],
        pages: [
          {
            id: "landing",
            locale: "en",
            canonical: "https://lavik.dev/en/",
            title: "Lavik homepage",
          },
        ],
        paths: ["/en/"],
      };
    else if (p === "report")
      data = {
        since: url.searchParams.get("since"),
        until: url.searchParams.get("until"),
        generatedAt: now,
        rows: [],
        placements: [],
      };
    else if (p === "email/status")
      data = {
        sender: "hubertzhang@eloqdata.com",
        outlookConfigured: true,
        contacts: 12,
        suppressed: 1,
        attempts24h: 0,
        settings,
      };
    else if (p === "email/contacts")
      data = {
        contacts: [
          {
            email: "engineer@example.invalid",
            first_name: "Alex",
            last_name: "Example",
            domain: "example.invalid",
            archived: false,
          },
        ],
        hasMore: false,
        offset: 0,
      };
    else if (p === "email/settings") {
      settings = r.postDataJSON();
      data = { ok: true };
    } else if (p === "email/jobs" && r.method() === "POST") {
      jobs.push({
        ...r.postDataJSON(),
        id,
        status: "draft",
        links: {},
        counts: [],
        scheduled_at: now,
      });
      data = { id };
    } else if (p === "email/jobs") data = { jobs };
    else if (p === `email/jobs/${id}/preview`)
      data = {
        variants: {
          a: {
            subject: jobs[0].content.a.subject,
            body: "Hello Alex, https://lavik.dev/go/example",
          },
          b: { subject: jobs[0].content.b.subject, body: "Variant B preview" },
        },
      };
    else if (p === `email/jobs/${id}/recipients`) data = { recipients: [] };
    else if (p === `email/jobs/${id}/start`) {
      if (!settings.enabled) {
        data = { error: "Enable sending first" };
        status = 400;
      } else {
        jobs[0].status = "running";
        data = { ok: true };
      }
    } else if (p === `email/jobs/${id}/pause`) {
      jobs[0].status = "paused";
      data = { ok: true };
    } else {
      data = { error: "Unexpected fixture route" };
      status = 400;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await expect(page.locator("#workspace")).toBeVisible();
  await page.getByRole("button", { name: "Cold email", exact: true }).click();
  await expect(page.locator("#email-status")).toContainText("12 contacts");
  await expect(page.locator("#email-contacts")).toContainText(
    "engineer@example.invalid",
  );
  await page.getByText("Create or edit a draft", { exact: true }).click();
  await page.locator("#email-job-name").fill("NVMe A/B");
  await page.locator("#email-job-domain").fill("example.invalid");
  await page.locator("#email-subject-a").fill("Keep Redis clients");
  await page.locator("#email-body-a").fill("Hi {{first_name}}, read {{link}}");
  await page.locator("#email-subject-b").fill("Grow capacity");
  await page.locator("#email-body-b").fill("Hi {{first_name}}, see {{link}}");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("#email-jobs")).toContainText("NVMe A/B");
  expect(jobs[0].content.b.subject).toBe("Grow capacity");
  await page.getByRole("button", { name: "Preview / recipients" }).click();
  await expect(page.locator("#email-preview")).toContainText("Hello Alex");
  await page.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(page.locator("#notice")).toContainText("Enable sending first");
  expect(jobs[0].status).toBe("draft");
  await page
    .getByText("Mailbox settings & sending limits", { exact: true })
    .click();
  await expect(page.locator("#email-address")).toHaveValue("");
  await page.locator("#email-enabled").check();
  await page.getByRole("button", { name: "Save mailbox settings" }).click();
  await page.getByRole("button", { name: "Start job", exact: true }).click();
  await expect(page.locator("#email-jobs .badge")).toHaveText("running");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator("#email-jobs .badge")).toHaveText("paused");
  await page.setViewportSize({ width: 375, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
