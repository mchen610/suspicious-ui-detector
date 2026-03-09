import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/integration",
    testMatch: "**/*.integration.test.ts",
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? "github" : "html",
    use: {
        // default port for Vite production preview server
        baseURL: "http://localhost:4173",
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        }
    ],
    webServer: {
        command: "npx serve tests/integration/fixtures --listen 4173 --no-clipboard",
        port: 4173,
        reuseExistingServer: !process.env.CI,
    }
});