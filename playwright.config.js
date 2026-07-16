import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

// In the cloud sandbox a Chromium build is pre-installed at /opt/pw-browsers;
// use it when present. On a laptop/CI, leave undefined so Playwright uses its
// own managed browser (run `npx playwright install chromium` once).
const sysChromium = '/opt/pw-browsers/chromium';
const executablePath = fs.existsSync(sysChromium) ? sysChromium : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  // Runs the app in "e2e" mode so it loads .env.e2e (mock Supabase config).
  // All Supabase network is intercepted by the test fixtures, so no real
  // backend or secrets are needed — the run is fully deterministic.
  webServer: {
    command: 'npm run dev:e2e',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
