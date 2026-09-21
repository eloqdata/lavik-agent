import { defineConfig } from "@playwright/test";
const port = Number(process.env.LAVIK_BROWSER_TEST_PORT ?? 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error(
    "LAVIK_BROWSER_TEST_PORT must be an integer from 1024 to 65535",
  );
export default defineConfig({
  testDir: "tests/browser",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory apps/web/out`,
    url: `http://127.0.0.1:${port}/en/`,
    reuseExistingServer: !process.env.CI,
  },
});
