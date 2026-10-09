import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      'PORT=3002 DATABASE_PATH=./test-results/browser.sqlite npx concurrently -k "tsx server/index.ts" "vite --port 5174 --host 127.0.0.1"',
    url: "http://127.0.0.1:5174",
    reuseExistingServer: false,
    env: { VITE_API_PORT: "3002", MINI_APP_URL: "http://127.0.0.1:5174" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
