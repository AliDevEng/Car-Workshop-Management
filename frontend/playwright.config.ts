import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  /*
   * `channel: 'chrome'` drives the Chrome already installed on the machine
   * rather than Playwright's bundled build. Both are Chromium, and the
   * stable channel is closer to what a customer runs — but the reason it is
   * pinned here is practical: `playwright install chromium` reaches
   * `cdn.playwright.dev`, which is not available from every network this
   * project is developed on, and an E2E suite that cannot start is an E2E
   * suite nobody runs. CI, which can reach the CDN, may drop the channel.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
