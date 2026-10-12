// End-to-end tests against the h5p-cli dev server, which tools/dev.mjs prepares with the built games, in Chromium,
// Firefox and WebKit (the engine of Safari). Locally Chromium is the Chrome of the system; E2E_BROWSERS picks some of
// them (E2E_BROWSERS=chromium for a quick run).
//
// @copyright 2026 Oksigenia <dev@oksigenia.cc>
// @license   MIT

import { defineConfig, devices } from '@playwright/test';

const port = process.env.E2E_PORT || '8091';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  // The dev server keeps the resume session in a global: one test at a time.
  workers: 1,
  reporter: process.env.CI ? 'list' : 'line',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // Silent tests: the games start muted, as if the player had pressed the speaker (the one test that needs sound
    // sends it to a zero gain), and the browsers that can be muted are.
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'h5p-oksigenia-muted', value: '1' }] }],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome', launchOptions: { args: ['--mute-audio'] } },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'media.volume_scale': '0.0' } } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ].filter((p) => !process.env.E2E_BROWSERS || process.env.E2E_BROWSERS.split(',').includes(p.name)),
  webServer: {
    command: `node tools/dev.mjs --port ${port} --no-watch`,
    // A game page, not the dashboard: the first view makes h5p-cli fetch its library registry, which can take a
    // while on a fresh machine, and that wait belongs here, not in the first test.
    url: `http://localhost:${port}/view/h5p-alphabet-wheel/alphabet-wheel-en?session=null`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
