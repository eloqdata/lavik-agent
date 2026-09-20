import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command:
      "python3 -m http.server 4173 --bind 127.0.0.1 --directory apps/web/out",
    url: "http://127.0.0.1:4173/en/",
    reuseExistingServer: !process.env.CI,
  },
});
