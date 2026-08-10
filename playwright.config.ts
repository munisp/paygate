import { defineConfig, devices } from "@playwright/test";

/**
 * PayGate Merchant Portal - Playwright E2E Configuration
 * Covers: Authentication, Dashboard, Transactions, Payouts, KYB, Disputes, Settings
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
    ["json", { outputFile: "playwright-report/results.json" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Use a persistent context so auth state is shared across tests
    storageState: "e2e/.auth/user.json",
  },
  projects: [
    // Setup project — runs auth setup before all tests
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
      use: { storageState: undefined },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      dependencies: ["setup"],
    },
  ],
  // Automatically start the dev server if not already running
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
