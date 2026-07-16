// Config de Playwright per als tests del panell (tests/tracker.spec.js).
// En local, si CHROMIUM_PATH apunta a un binari (p. ex. /opt/pw-browsers/chromium),
// s'usa aquest; si no, el Chromium que instal·la Playwright.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
});
