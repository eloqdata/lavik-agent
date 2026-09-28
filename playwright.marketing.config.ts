import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/marketing-browser",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "npx wrangler dev --config tests/marketing-browser/wrangler.jsonc --local --env-file /dev/null --persist-to .cache/marketing-browser-state",
    url: "http://127.0.0.1:4175/",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
