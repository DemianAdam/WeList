import { defineConfig, devices } from "@playwright/test";

// Deliberately no .env.local fallback: this must never select a personal deployment.
const url = process.env.WELIST_STAGING_URL;
export default defineConfig({
  testDir: "./tests/staging",
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: "test-results/staging",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/staging", open: "never" }],
    ["json", { outputFile: "test-results/staging-browser.json" }],
  ],
  use: {
    baseURL: "http://localhost:5181",
    // Real credentials travel through auth/registration calls; keep screenshots
    // and safe diagnostics instead of recording raw transport/action arguments.
    trace: "off",
    screenshot: "only-on-failure",
  },
  webServer: url
    ? {
        command: "npm run dev -- --host localhost --port 5181 --strictPort",
        url: "http://localhost:5181",
        reuseExistingServer: false,
        env: { VITE_DATA_MODE: "convex", VITE_CONVEX_URL: url },
      }
    : undefined,
  projects: [
    { name: "staging-mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "staging-mobile-webkit", use: { ...devices["iPhone 13"] } },
    { name: "staging-desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
