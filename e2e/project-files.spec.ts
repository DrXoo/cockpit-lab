import { readFile } from 'node:fs/promises';
import {
  test,
  expect,
  openApp,
  importProject,
  getState,
  getSavedProject,
  readFixture,
  activeLayoutConfig,
} from './support.ts';

test('importing a project restores its configuration and survives a reload', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const expected = activeLayoutConfig(readFixture('gt-room.json'));
  expect(await getState(page)).toEqual(expected);
  await page.reload();
  expect(await getState(page)).toEqual(expected);
});

test('a v1 file opens with its desk and room, and says its cockpit was left out', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('#importFile').setInputFiles('e2e/fixtures/legacy-v1.json');
  const dialog = page.locator('#leftOutCockpitDialog');
  await expect(dialog).toBeVisible();
  // Imported from a file: there is no copy of an earlier version in this browser to mention.
  await expect(page.locator('#leftOutCockpitKept')).toBeHidden();
  await dialog.locator('[data-close]').last().click();
  await expect(dialog).toBeHidden();
  expect(await getState(page)).toMatchObject({ deskEnabled: true, roomW: 300, roomD: 300 });
  await expect.poll(async () => (await getSavedProject(page))?.version).toBe(5);
  expect((await getSavedProject(page)).cockpit).toBeNull();
});

test('a file from another program is rejected and the project is kept', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const before = await getState(page);
  await page.locator('#importFile').setInputFiles({
    name: 'other.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'Other', version: 2, config: {} })),
  });
  await expect(page.locator('#toast')).toBeVisible();
  expect(await getState(page)).toEqual(before);
});

test('exporting JSON writes the current project as a v5 file', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'flight-lifted.json');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#saveConfig').click(),
  ]);
  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(file).toMatchObject({ app: 'Cockpit Lab', version: 5, units: 'cm', cockpit: null });
  expect(activeLayoutConfig(file)).toEqual(await getState(page));
  expect(file.setup.step).toBe('complete');
});

test('a new project, once confirmed, restarts the guided setup', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#newProject').click();
  await page.locator('#newProjectRoom').click();
  await expect(page.locator('body')).toHaveAttribute('data-guided', 'true');
  expect(await getState(page)).toMatchObject({ roomEnabled: false, deskEnabled: false });
  expect((await getSavedProject(page)).setup.step).toBe('room');
});
