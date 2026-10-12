// End-to-end tests against the h5p-cli dev server, which tools/dev.mjs prepares with the built games.
// Locally they use the Chrome of the system; in CI, the Chromium of Playwright.
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { defineConfig } from '@playwright/test';

const port = process.env.E2E_PORT || '8091';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  // The dev server keeps the resume session in a global: one test at a time.
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node tools/dev.mjs --port ${port} --no-watch`,
    url: `http://localhost:${port}/dashboard`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
