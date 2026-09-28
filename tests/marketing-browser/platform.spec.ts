import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";

test("admin activates, tracks groups, generates share links and QR codes, exports, changes and recovers password", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const activation = randomBytes(32).toString("hex"),
    password = "local browser password 2026!";
  expect((await request.post("/test/reset", { data: {} })).status()).toBe(204);
  expect(
    (
      await request.post("/test/bootstrap", {
        data: {
          activationHash: createHash("sha256").update(activation).digest("hex"),
        },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/report")).status()).toBe(401);
  expect((await request.get("/api/placements")).status()).toBe(401);
  expect((await request.post("/api/bootstrap", { data: {} })).status()).toBe(
    404,
  );
  await page.goto(`/#setup=${activation}`);
  await expect(page).toHaveURL("http://127.0.0.1:4175/");
  await expect(
    page.getByRole("heading", { name: "Make every share count." }),
  ).toBeVisible();
  await page
    .locator("#login-form")
    .getByLabel("Password", { exact: true })
    .fill("admin");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your password." }),
  ).toBeVisible();
  expect((await page.request.get("/api/placements")).status()).toBe(403);
  await page
    .locator("#setup-form")
    .getByLabel("Current password", { exact: true })
    .fill("admin");
  await page
    .locator("#setup-form")
    .getByLabel("New password", { exact: true })
    .fill(password);
  await page
    .locator("#setup-form")
    .getByLabel("Confirm new password", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Set password and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery key" }),
  ).toBeVisible();
  const recovery = await page.getByLabel("New recovery key").inputValue();
  expect(recovery).toMatch(/^[a-f0-9]{64}$/);
  await page.getByRole("button", { name: "I saved the key" }).click();
  await expect(page.locator("#report-status")).toContainText("Updated");
  for (const [placement, event] of [
    ["wg01", "visit"],
    ["wg01", "visit"],
    ["wg01", "engaged"],
    ["wg02", "visit"],
    ["wg02", "download"],
  ]) {
    expect(
      (
        await request.post("/test/event", {
          data: {
            source: "wechat",
            medium: "social",
            campaign: "lavik-field-notes-2026-09-26",
            placement,
            event,
            path: "/en/blog/lavik-field-notes-2026-09-26/",
          },
        })
      ).status(),
    ).toBe(204);
  }
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("#placement-table")).toContainText(
    "WeChat Group 01",
  );
  await expect(page.locator("#placement-table")).toContainText("50.0%");
  await page
    .getByRole("combobox", { name: "Group / placement", exact: true })
    .selectOption("wg01");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.locator("#placement-table tbody tr")).toHaveCount(1);
  await expect(page.locator("#placement-table")).not.toContainText("wg02");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export groups CSV" }).click();
  const file = await download,
    contents = await fs.readFile((await file.path())!, "utf8");
  expect(contents).toContain('"wechat","wg01","WeChat Group 01","2"');
  await page
    .getByRole("button", { name: "Groups & placements", exact: true })
    .click();
  await page.getByLabel("Name for wg01").fill("Database engineers");
  await page
    .locator("#placement-editor tr")
    .filter({ has: page.getByLabel("Name for wg01") })
    .getByRole("button", { name: "Save name" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Placement name updated",
  );
  await page.getByRole("button", { name: "Share links", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Article & language", exact: true })
    .selectOption("lavik-field-notes-2026-09-26/en");
  await page.getByLabel("Database engineers · WeChat", { exact: true }).check();
  await page.getByLabel("WeChat Group 02 · WeChat", { exact: true }).check();
  await page.getByRole("button", { name: "Generate share links" }).click();
  await expect(page.locator("#link-table tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Generate share links" }).click();
  await expect(page.locator("#link-table tbody tr")).toHaveCount(2);
  const saved = await (await page.request.get("/api/links")).json();
  expect(saved.links[0].taggedUrl).toMatch(/utm_content=wg0[12]/);
  expect(saved.links[0].url).toMatch(/^https:\/\/lavik.dev\/go\/[a-f0-9]{20}$/);
  await page
    .locator("#link-table")
    .getByRole("button", { name: "QR", exact: true })
    .first()
    .click();
  await expect(
    page.getByAltText("QR code for this share link"),
  ).toHaveAttribute("src", /^data:image\/svg\+xml/);
  const qrDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download SVG" }).click();
  expect(
    await fs.readFile((await (await qrDownload).path())!, "utf8"),
  ).toContain("<svg");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: ".cache/marketing-dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: ".cache/marketing-dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make every share count." }),
  ).toBeVisible();
  expect((await page.request.get("/api/links")).status()).toBe(401);
  await page.getByText("Forgot your password?", { exact: true }).click();
  await page
    .locator("#recover-form")
    .getByLabel("Recovery key", { exact: true })
    .fill(recovery);
  await page
    .locator("#recover-form")
    .getByLabel("New password", { exact: true })
    .fill("recovered browser password 2026!");
  await page
    .locator("#recover-form")
    .getByLabel("Confirm new password", { exact: true })
    .fill("recovered browser password 2026!");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery key" }),
  ).toBeVisible();
  expect(await page.getByLabel("New recovery key").inputValue()).not.toBe(
    recovery,
  );
  await page.getByRole("button", { name: "I saved the key" }).click();
  await expect(page.locator("#report-status")).toContainText("Updated");
  expect(errors).toEqual([]);
});
