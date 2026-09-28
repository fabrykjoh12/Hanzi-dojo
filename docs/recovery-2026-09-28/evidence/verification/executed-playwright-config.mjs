import { defineConfig } from '/workspace/scratch/bb2a1954cdbf/hanzi-dojo-recovery/node_modules/@playwright/test/index.mjs';
export default defineConfig({
  testDir: '/workspace/scratch/bb2a1954cdbf/hanzi-dojo-recovery/tests/e2e',
  testIgnore: ['**/visual.spec.js', '**/store-screenshots.spec.js'],
  outputDir: '/tmp/hanzi-recovery-browser-results',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5192',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: '/tmp/hanzi-chromium/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--disable-gpu'],
      env: { ...process.env, LD_LIBRARY_PATH: '/tmp/hanzi-chromium/lib', FONTCONFIG_FILE: '/tmp/hanzi-system-fonts/fonts.conf' },
    },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --mode e2e --host 127.0.0.1 --port 5192 --strictPort',
    cwd: '/workspace/scratch/bb2a1954cdbf/hanzi-dojo-recovery',
    env: { DOJO_PUBLIC_BUILD: '1', DOJO_NATIVE_BUILD: '1' },
    url: 'http://127.0.0.1:5192',
    reuseExistingServer: false,
  },
});
