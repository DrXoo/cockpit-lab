// Shows a change by eye: builds the app, serves the build on the preview port, runs a walk
// through it in the browser the end-to-end tests use, and saves the screenshots the walk takes.
//
//   npm run look -- <walk.mjs> [folder for the screenshots]
//
// The walk is a module whose default export receives `{ page, shot }`, with the page already
// open on the app, so a walk starts with its first click; `await shot('name')`
// saves name.png in the folder (by default one in the system's temporary folder). Errors of the
// page are printed as they happen. A walk can build its cockpit design with tests/support/designs.ts
// and load it through #importCockpitFile with cockpitFileData (src/cockpit/file.ts), importing
// both by an absolute file:// URL when the walk lives outside the repository.
//
// The preview port keeps it apart from the dev server (5173), whose browser storage may hold
// real designs; a project made here lives only in this run's browser.
import { spawn, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import config from '../playwright.config.ts';

const PREVIEW_PORT = 4173;
const SERVER_WAIT_MS = 30_000;
const SERVER_POLL_MS = 250;

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = join(root, 'node_modules/vite/bin/vite.js');
const [walkPath, outArgument] = process.argv.slice(2);
if (!walkPath) {
  console.error('Usage: npm run look -- <walk.mjs> [folder for the screenshots]');
  process.exit(2);
}
const out = resolve(outArgument ?? join(tmpdir(), 'cockpit-lab-look'));
const walk = (await import(pathToFileURL(resolve(walkPath)).href)).default;
if (typeof walk !== 'function') throw new Error(`${walkPath} must export a function by default.`);

const url = `http://127.0.0.1:${PREVIEW_PORT}/`;
// Another server on the port would answer for this build and show something else.
if (await answers(url)) {
  console.error(`Port ${PREVIEW_PORT} is already in use: stop what serves ${url} first.`);
  process.exit(1);
}

const built = spawnSync(process.execPath, [vite, 'build', '--logLevel', 'warn'], {
  cwd: root,
  stdio: 'inherit',
});
if (built.status !== 0) process.exit(built.status ?? 1);

const server = spawn(
  process.execPath,
  [vite, 'preview', '--port', String(PREVIEW_PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: root, stdio: 'inherit' },
);
const { use } = config;
let browser;
try {
  await serverReady(url);
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({ channel: use?.channel, ...use?.launchOptions });
  const page = await browser.newPage({
    viewport: use?.viewport,
    deviceScaleFactor: use?.deviceScaleFactor,
    locale: use?.locale,
    timezoneId: use?.timezoneId,
  });
  page.on('pageerror', (error) => console.error(`Page error: ${error.message}`));
  await page.goto(url);
  const shot = async (name) => {
    const path = join(out, `${name}.png`);
    await page.screenshot({ path });
    console.log(path);
  };
  await walk({ page, shot });
} finally {
  await browser?.close();
  server.kill();
}

/** Waits until the preview answers, or fails once it has had long enough to start. */
async function serverReady(address) {
  const deadline = Date.now() + SERVER_WAIT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('The preview server stopped before answering.');
    if (await answers(address)) return;
    await new Promise((done) => setTimeout(done, SERVER_POLL_MS));
  }
  throw new Error(`The preview server did not answer on ${address}.`);
}

async function answers(address) {
  try {
    return (await fetch(address)).ok;
  } catch {
    return false;
  }
}
