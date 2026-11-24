import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against the BUILT site (`npm run build` first), served by `astro preview`.
// Projects: desktop Chromium and WebKit, plus mobile emulation (Pixel 7 = Chromium, iPhone 14 = WebKit).
// The live-site smoke test (e2e/live.spec.ts) runs only when LIVE_URL is set (post-deploy job).
const PORT = 4329; // not astro's default 4321, so a dev or preview server already running there is never reused
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: process.env.LIVE_URL ?? `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-pixel', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.LIVE_URL
    ? undefined
    : { command: `npx astro preview --ignore-lock --host 127.0.0.1 --port ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: false, timeout: 60_000 },
});
