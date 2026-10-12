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
    // A game page, not the dashboard: the first view makes h5p-cli fetch its library registry, which can take a
    // while on a fresh machine, and that wait belongs here, not in the first test.
    url: `http://localhost:${port}/view/h5p-alphabet-wheel/alphabet-wheel-en?session=null`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
