import { readFile } from 'node:fs/promises';
import {
  test,
  expect,
  openApp,
  importProject,
  getState,
  getEvaluation,
  getSavedProject,
  readFixture,
  activeLayoutConfig,
} from './support.ts';

test('importing a v2 project restores its configuration and survives a reload', async ({
  page,
}) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  // A v2 file has no saved arm poses, so the project opens without any.
  const expected = { ...readFixture('gt-room.json').config, armPoses: [] };
  expect(await getState(page)).toEqual(expected);
  await page.reload();
  expect(await getState(page)).toEqual(expected);
});

test('a v1 file opens with a desk and a cockpit, as earlier projects always had', async ({
  page,
}) => {
  await openApp(page);
  await importProject(page, 'legacy-v1.json');
  expect(await getState(page)).toMatchObject({
    deskEnabled: true,
    cockpitEnabled: true,
    length: 150,
    width: 66,
    preset: 'hybrid',
  });
  expect((await getSavedProject(page)).version).toBe(3);
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

test('exporting JSON writes the current project as a v3 file', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'flight-lifted.json');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#saveConfig').click(),
  ]);
  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(file).toMatchObject({ app: 'Cockpit Lab', version: 3, units: 'cm' });
  expect(activeLayoutConfig(file)).toEqual(await getState(page));
  expect(file.setup.step).toBe('complete');
});

test('the cut list CSV has one row per part and accessory', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#openSummary').click();
  await expect(page.locator('#summaryDialog')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#csvBtn').click(),
  ]);
  const csv = await readFile(await download.path(), 'utf8');
  const { parts, accessories } = await getEvaluation(page);
  expect(csv.charCodeAt(0), 'UTF-8 byte order mark').toBe(0xfeff);
  expect(csv.split('\r\n')).toHaveLength(3 + parts.length + accessories.length);
});

test('choosing a preset applies its rig settings', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-rig').click();
  await page.locator('#preset').selectOption('small');
  expect(await getState(page)).toMatchObject({
    preset: 'small',
    length: 130,
    width: 60,
    shifter: false,
  });
});

test('a new project, once confirmed, restarts the guided setup', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#newProject').click();
  await page.locator('#confirmReset').click();
  await expect(page.locator('body')).toHaveAttribute('data-guided', 'true');
  expect(await getState(page)).toMatchObject({
    roomEnabled: false,
    deskEnabled: false,
    cockpitEnabled: false,
  });
  expect((await getSavedProject(page)).setup.step).toBe('room');
});
