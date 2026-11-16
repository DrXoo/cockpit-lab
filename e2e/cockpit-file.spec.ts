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
import { emptyDesign } from '../src/cockpit-design.ts';
import { cockpitFileData } from '../src/cockpit-file.ts';

// A cockpit file moves a design from one project to another (CONTEXT.md, docs/adr/0001).

const asFile = (data: unknown) => ({
  name: 'cockpit.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(data)),
});
const emptyDesignFile = () => asFile(cockpitFileData(emptyDesign()));

test('an imported cockpit file becomes the design, and exports again the same', async ({
  page,
}) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const room = await getState(page);
  await page.locator('#cockpitEditor').click();
  await page.locator('#importCockpitFile').setInputFiles(emptyDesignFile());
  await expect
    .poll(async () => (await getSavedProject(page)).cockpit)
    .toEqual({ units: 'mm', history: [] });
  expect(await getState(page)).toEqual(room);

  await expect(page.locator('#exportCockpit')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportCockpit').click(),
  ]);
  const file = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(file).toEqual(cockpitFileData(emptyDesign()));
});

test('importing over a design asks first', async ({ page }) => {
  await openApp(page);
  await page.locator('#cockpitEditor').click();
  await page.locator('#importCockpitFile').setInputFiles(emptyDesignFile());
  await expect(page.locator('#exportCockpit')).toBeVisible();

  await page.locator('#importCockpitFile').setInputFiles(emptyDesignFile());
  await expect(page.locator('#replaceCockpitDialog')).toBeVisible();
  await page.locator('#replaceCockpitDialog [data-close]').last().click();
  await expect(page.locator('#replaceCockpitDialog')).toBeHidden();
});

test('a cockpit file of the retired configurator is refused, and says why', async ({ page }) => {
  await openApp(page);
  await page.locator('#cockpitEditor').click();
  const version1 = { app: 'Cockpit Lab', kind: 'cockpit', version: 1, units: 'cm', cockpit: {} };
  await page.locator('#importCockpitFile').setInputFiles(asFile(version1));
  await expect(page.locator('#toast')).toContainText('retired configurator');
  await expect(page.locator('#exportCockpit')).toBeHidden();
});

test('a project file and a cockpit file are each opened in their own place', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const before = await getState(page);

  await page.locator('#importFile').setInputFiles(emptyDesignFile());
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
