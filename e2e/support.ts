// Shared helpers for the end-to-end tests. Elements are selected by id, data attribute or
// role rather than by visible text, so the tests survive the translation of the UI.
import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectConfig, readProject } from '../src/project.ts';

export const STORAGE_KEY = 'cockpit-lab-v4';

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
export const activeLayoutConfig = (file: unknown) => projectConfig(readProject(file));
