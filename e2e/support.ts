// Shared helpers for the end-to-end tests. Elements are selected by id, data attribute or
// role rather than by visible text, so the tests survive the translation of the UI.
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectConfig, readProject } from '../src/project.ts';
import {
  addAnchoredProfile,
  editProfile,
  type Operation,
  type ProfileValues,
} from '../src/cad/history.ts';
import { cockpitFileData } from '../src/cockpit-file.ts';

export const STORAGE_KEY = 'cockpit-lab-v5';

export const fixturePath = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

export const readFixture = (name: string) => JSON.parse(readFileSync(fixturePath(name), 'utf8'));

/** Every test fails if the page throws or logs an error, even when its assertions pass. */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await use(page);
    expect(errors, 'errors in the page').toEqual([]);
  },
});

export { expect };

/**
 * With software WebGL and every visual worker busy, a screenshot can take longer than the default
 * 5 s to hold still. How long it takes is not what the screenshot tests check.
 */
export const SCREENSHOT_TIMEOUT_MS = 15_000;

export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#viewport canvas, #viewport svg').first()).toBeAttached();
}

export async function importProject(page: Page, fixture: string): Promise<void> {
  await page.locator('#importFile').setInputFiles(fixturePath(fixture));
  await expect(page.locator('body')).toHaveAttribute('data-guided', 'false');
}

/** The configurator state, through the app's read-only debugging hook. */
export const getState = (page: Page) => page.evaluate(() => (window as any).cockpitLab.getState());

export const getEvaluation = (page: Page) =>
  page.evaluate(() => (window as any).cockpitLab.getEvaluation());

/** The project the app autosaved in this browser. */
export const getSavedProject = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), STORAGE_KEY);

/** The configuration of the active layout in a saved or exported project file. */
export const activeLayoutConfig = (file: unknown) => projectConfig(readProject(file).project);

/** A small frame built with the design history: two rails, crossmembers and an upright. */
export function sampleFrameHistory(): Operation[] {
  const profiles: [name: string, values: Partial<ProfileValues>][] = [
    ['Left rail', { sectionId: '40x80', lengthMm: 1200, startMm: { x: -260, y: 40, z: 0 } }],
    ['Right rail', { sectionId: '40x80', lengthMm: 1200, startMm: { x: 260, y: 40, z: 0 } }],
    ['Front crossmember', { axis: 'x', lengthMm: 480, startMm: { x: -240, y: 60, z: 1100 } }],
    ['Wheel upright', { axis: 'y', lengthMm: 700, startMm: { x: -260, y: 80, z: 1000 } }],
    [
      'Seat crossmember',
      {
        sectionId: '40x120',
        axis: 'x',
        heightAxis: 'z',
        lengthMm: 480,
        startMm: { x: -240, y: 20, z: 300 },
      },
    ],
  ];
  let history: Operation[] = [];
  for (const [name, values] of profiles) {
    const added = addAnchoredProfile(history);
    history = editProfile(added.history, added.partId, { name, ...values });
  }
  return history;
}

/** A cockpit file, as the file chooser receives it. */
export const cockpitFileOf = (history: Operation[]) => ({
  name: 'cockpit.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(cockpitFileData({ history }))),
});
