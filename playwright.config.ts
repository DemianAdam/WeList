import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://localhost:5180",
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
  },
  webServer: {
    command: "npm run dev -- --host localhost --port 5180",
    url: "http://localhost:5180",
    env: { VITE_DATA_MODE: "mock" },
    reuseExistingServer: false,
  },
  projects: [
    { name: "mobile-chromium", use: { browserName: "chromium" } },
    { name: "mobile-webkit", use: { browserName: "webkit" } },
  ],
});
