import type { Page } from '@playwright/test';
import { test, expect, openApp, readFixture, getState, getSavedProject } from './support.ts';
import { projectConfig, projectData, readProject } from '../src/project.ts';

/** The settings of a parametric cockpit, as versions before v5 saved it. */
const PARAMETRIC_COCKPIT = { length: 145, width: 64, seatH: 32, preset: 'gt' };

const fixtureFile = () => projectData(readProject(readFixture('gt-room.json')).project);

/** The gt-room project as v4 saved it, with a parametric cockpit the room includes. */
function savedByVersion4(): string {
  const { room, ...file } = fixtureFile();
  return JSON.stringify({
    ...file,
    version: 4,
    cockpit: PARAMETRIC_COCKPIT,
    room: { ...room, shared: { ...room.shared, cockpitEnabled: true } },
  });
}

/** The gt-room project as v3 saved it: the parametric cockpit among the shared settings. */
function savedByVersion3(): string {
  const { room, cockpit, ...file } = fixtureFile();
  return JSON.stringify({
    ...file,
    ...room,
    version: 3,
    shared: { ...room.shared, ...PARAMETRIC_COCKPIT, cockpitEnabled: true },
  });
}

/** Seeds the browser storage once, as an earlier version left it. */
async function seed(page: Page, key: string, text: string) {
  await page.addInitScript(
    ([storageKey, saved]) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem(storageKey, saved);
      sessionStorage.setItem('seeded', 'yes');
    },
    [key, text],
  );
}

const readKey = (page: Page, key: string) =>
  page.evaluate((storageKey) => localStorage.getItem(storageKey), key);

for (const [version, key, saved] of [
  [4, 'cockpit-lab-v4', savedByVersion4],
  [3, 'cockpit-lab-v3', savedByVersion3],
] as const)
  test(`a v${version} save opens with its room, without its cockpit, and stays untouched`, async ({
    page,
  }) => {
    const text = saved();
    const expected = projectConfig(readProject(JSON.parse(text)).project);
    await seed(page, key, text);
    await openApp(page);
    const dialog = page.locator('#leftOutCockpitDialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#leftOutCockpitKept')).toBeVisible();
    await dialog.locator('[data-close]').last().click();
    expect(await getState(page)).toEqual(expected);

    await page.reload();
    expect((await getSavedProject(page)).version).toBe(5);
    expect((await getSavedProject(page)).cockpit).toBeNull();
    await expect(page.locator('#leftOutCockpitDialog')).toBeHidden();
    expect(await getState(page)).toEqual(expected);
    expect(await readKey(page, key)).toBe(text);
  });
