import { defineConfig, devices } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT ?? "4173";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  expect: { timeout: 8000 },
  use: {
    baseURL: `http://127.0.0.1:${port}/wow-goals/`,
    trace: "retain-on-failure",
    serviceWorkers: "allow",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node tests/serve-production.mjs",
    env: { PORT: port },
    url: `http://127.0.0.1:${port}/wow-goals/`,
    reuseExistingServer: false,
  },
});
