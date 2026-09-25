import { test, expect } from "@playwright/test";

test("quick-start package selection produces complete local-executable instructions in both languages", async ({
  page,
}) => {
  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`/${locale}/docs/0.1.0/quick-start/`);
    await expect(page.locator(".download-box a")).toHaveAttribute(
      "href",
      `/${locale}/download/`,
    );
    const choices = page.locator(".quick-start-options select");
    for (const variant of ["minimal", "standard"])
      for (const arch of ["x86_64", "aarch64"]) {
        await choices.nth(0).selectOption(variant);
        await choices.nth(1).selectOption(arch);
        const directory = `lavik-v0.1.0-beta.1-linux-${arch}${variant === "minimal" ? "-minimal" : ""}`;
        const code = page.locator(".quick-start-install .copy-code").nth(1);
        await expect(code).toContainText(
          `cd ${directory} &&\n./lavik --version`,
        );
        await expect(code).toContainText(
          `sha256sum -c ${directory}.tar.gz.sha256`,
        );
        if (variant === "standard")
          await expect(
            page.locator(".quick-start-install .copy-code").first(),
          ).toContainText("libnuma1 libuuid1");
      }
    await expect(page.locator(".recipe pre").first()).toContainText(
      "./lavik --bind",
    );
    await expect(page.locator(".recipe pre").first()).not.toContainText(
      "exec lavik",
    );
    await expect(page.locator(".recipe pre").nth(1)).toContainText("127.0.0.1");
    await page.locator(".quick-start-spdk summary").click();
    await expect(page.locator(".quick-start-spdk")).toContainText(
      "--storage=spdk",
    );
    await expect(page.locator(".quick-start-spdk a")).toHaveAttribute(
      "href",
      /building-and-packaging.md#runtime-backend-selection$/,
    );
    for (const width of [375, 820, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});
