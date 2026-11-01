import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "test-results/local-browser",
  workers: 2,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/local", open: "never" }],
    ["json", { outputFile: "test-results/local-browser.json" }],
  ],
  use: {
    baseURL: "http://localhost:5180",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host localhost --port 5180 --strictPort",
    url: "http://localhost:5180",
    env: { VITE_DATA_MODE: "mock" },
    reuseExistingServer: false,
  },
  projects: [
    { name: "mobile-chromium", use: { browserName: "chromium" } },
    { name: "mobile-webkit", use: { browserName: "webkit" } },
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
