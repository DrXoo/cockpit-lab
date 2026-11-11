import { defineConfig } from '@playwright/test';

const PORT = 5190;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  // Reference screenshots are local to each machine and not committed: a missing one is
  // created on the first run, and later runs compare against it.
  updateSnapshots: 'missing',
  snapshotPathTemplate: 'e2e/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The installed Chrome; no browser download needed.
    channel: 'chrome',
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'Europe/Madrid',
    launchOptions: {
      // Software WebGL keeps screenshots identical between runs on the same machine.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu-rasterization'],
    },
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
