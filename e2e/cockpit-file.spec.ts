import { readFile } from 'node:fs/promises';
import {
  test,
  expect,
  openApp,
  importProject,
  getState,
  getSavedProject,
  fixturePath,
} from './support.ts';
import { designFromBase } from '../src/cockpit-design.ts';
import { cockpitFileData } from '../src/cockpit-file.ts';

// A cockpit file moves a design from one project to another (CONTEXT.md, docs/adr/0001).

const asFile = (data: unknown) => ({
  name: 'cockpit.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(data)),
});
const flightFile = () => asFile(cockpitFileData(designFromBase('flight')));

test('a cockpit file exported from one project starts the design of another', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#cockpitEditor').click();
  await page.locator('#tab-posture').click();
  await page.locator('#height-number').fill('186');
  await page.locator('#height-number').press('Enter');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportCockpit').click(),
  ]);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8'));
  expect(file).toMatchObject({ app: 'Cockpit Lab', kind: 'cockpit', version: 1, units: 'cm' });
  expect(file.cockpit).toMatchObject({ preset: 'gt', height: 186 });

  await page.locator('#newProject').click();
  await page.locator('#newProjectCockpit').click();
  await page.locator('#importCockpitFile').setInputFiles(path);
  await expect(page.locator('#preset')).toHaveValue('gt');
  await expect.poll(async () => (await getSavedProject(page)).cockpit?.height).toBe(186);
  expect((await getState(page)).roomEnabled).toBe(false);
});

test('importing over a design asks first, and the room places the new one', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const placed = await getState(page);
  await page.locator('#cockpitEditor').click();

  await page.locator('#importCockpitFile').setInputFiles(flightFile());
  await expect(page.locator('#replaceCockpitDialog')).toBeVisible();
  await page.locator('#replaceCockpitDialog [data-close]').last().click();
  expect((await getState(page)).preset).toBe('gt');

  await page.locator('#importCockpitFile').setInputFiles(flightFile());
  await page.locator('#confirmReplaceCockpit').click();
  await expect(page.locator('#preset')).toHaveValue('flight');
  const state = await getState(page);
  expect([state.preset, state.hotas, state.cockpitEnabled]).toEqual(['flight', true, true]);
  expect([state.cockpitX, state.cockpitZ]).toEqual([placed.cockpitX, placed.cockpitZ]);
});

test('a project file and a cockpit file are each opened in their own place', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const before = await getState(page);

  await page.locator('#importFile').setInputFiles(flightFile());
  await expect(page.locator('#toast')).toHaveText(
    'This is a cockpit file: import it from the Cockpit editor.',
  );
  await page.locator('#cockpitEditor').click();
  await page.locator('#importCockpitFile').setInputFiles(fixturePath('flight-lifted.json'));
  await expect(page.locator('#toast')).toHaveText(
    'This is a project file: open it with Open JSON.',
  );
  expect(await getState(page)).toEqual(before);
});
