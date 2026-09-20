import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/admin-browser",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 12000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "npx wrangler dev --local --port 4174 --local-upstream 127.0.0.1:4174 --upstream-protocol http --env-file /dev/null --var ADMIN_LOCAL:true --var RUNNER_TOKEN:local-test-runner-token-with-at-least-32-characters --persist-to .cache/admin-browser-state",
    url: "http://127.0.0.1:4174/admin/",
    timeout: 60000,
    reuseExistingServer: false,
  },
});
