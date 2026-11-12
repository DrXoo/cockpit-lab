import { defineConfig } from '@playwright/test';

const PORT = 5190;

/** Specs that compare screenshots with local references. */
const VISUAL_SPECS = ['**/page-appearance.spec.ts', '**/rendering.spec.ts', '**/theme.spec.ts'];
/**
 * Screenshots render WebGL in software and wait for the page to hold still. Run together on
 * every worker, they starve each other of CPU and time out; a few at a time keeps them steady
 * while the functional tests use the remaining workers.
 */
const VISUAL_WORKERS = 3;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  // Reference screenshots are local to each machine and not committed: a missing one is
  // created on the first run, and later runs compare against it.
  updateSnapshots: 'missing',
  snapshotPathTemplate: 'e2e/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      // The default threshold (0.2) lets small color changes pass unnoticed. 0.02 still absorbs
      // the ±1 level noise of software WebGL on antialiased edges.
      maxDiffPixels: 0,
      threshold: 0.02,
      animations: 'disabled',
      stylePath: './e2e/screenshot.css',
    },
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
  projects: [
    { name: 'functional', testIgnore: VISUAL_SPECS },
    { name: 'visual', testMatch: VISUAL_SPECS, workers: VISUAL_WORKERS },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
