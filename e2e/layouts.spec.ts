import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  test,
  expect,
  openApp,
  importProject,
  getState,
  getSavedProject,
  activeLayoutConfig,
} from './support.ts';

interface Furniture {
  id: string;
  x: number;
}

const furniture = async (page: Page, id: string): Promise<Furniture | undefined> =>
  (await getState(page)).roomFurniture.find((item: Furniture) => item.id === id);

async function duplicateLayout(page: Page, name: string) {
  await page.locator('#duplicateLayout').click();
  await page.locator('#layoutName').fill(name);
  await page.locator('#confirmLayoutName').click();
  await expect(page.locator('#layoutNameDialog')).not.toBeVisible();
}

async function moveBed(page: Page, fromWallCm: string) {
  await page.locator('#tab-furniture').click();
  await page.locator('#roomTarget').selectOption('furniture:bed');
  await page.locator('#room-x-number').fill(fromWallCm);
  await page.locator('#room-x-number').press('Enter');
}

test('the layout picker appears once the setup is done, with one layout', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#layoutArea')).toBeHidden();
  await importProject(page, 'gt-room.json');
  await expect(page.locator('#layoutArea')).toBeVisible();
  await expect(page.locator('#layoutSelect option')).toHaveCount(1);
  await expect(page.locator('#deleteLayout')).toBeDisabled();
});

test('a duplicate is edited on its own and the original stays as it was', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const original = await getState(page);

  await duplicateLayout(page, 'Bed by the door');
  await expect(page.locator('#layoutSelect')).toHaveValue('layout-2');
  await moveBed(page, '50');
  const moved = await getState(page);
  expect((await furniture(page, 'bed'))?.x).toBe(original.roomX + 50);

  await page.locator('#layoutSelect').selectOption('layout-1');
  expect(await getState(page)).toEqual(original);
  await page.locator('#layoutSelect').selectOption('layout-2');
  expect(await getState(page)).toEqual(moved);

  await page.reload();
  await expect(page.locator('#layoutSelect')).toHaveValue('layout-2');
  await expect(page.locator('#layoutSelect option')).toHaveText(['Base', 'Bed by the door']);
  expect(await getState(page)).toEqual(moved);
});

test('furniture hidden in one layout stays in the others', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await duplicateLayout(page, 'Without the bed');
  await page.locator('#tab-furniture').click();
  await page.locator('#roomTarget').selectOption('furniture:bed');
  await page.locator('#roomHide').click();
  expect(await furniture(page, 'bed')).toBeUndefined();

  await page.locator('#layoutSelect').selectOption('layout-1');
  expect(await furniture(page, 'bed')).toBeDefined();

  await page.locator('#layoutSelect').selectOption('layout-2');
  await page.locator('[data-show-furniture="bed"]').click();
  expect(await furniture(page, 'bed')).toBeDefined();
  await expect(page.locator('[data-show-furniture]')).toHaveCount(0);
});

test('a layout can be renamed and deleted, but the last one stays', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await duplicateLayout(page, 'Trial');
  await page.locator('#renameLayout').click();
  await page.locator('#layoutName').fill('Final');
  await page.locator('#confirmLayoutName').click();
  await expect(page.locator('#layoutSelect option')).toHaveText(['Base', 'Final']);

  await page.locator('#deleteLayout').click();
  await page.locator('#confirmDeleteLayout').click();
  await expect(page.locator('#layoutSelect option')).toHaveText(['Base']);
  await expect(page.locator('#deleteLayout')).toBeDisabled();
});

test('an exported project brings back every layout', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await duplicateLayout(page, 'Trial');
  await moveBed(page, '50');
  const moved = await getState(page);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#saveConfig').click(),
  ]);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8'));
  expect(file.layouts).toHaveLength(2);
  expect(activeLayoutConfig(file)).toEqual(moved);

  await page.locator('#newProject').click();
  await page.locator('#confirmReset').click();
  await expect(page.locator('#layoutArea')).toBeHidden();
  await page.locator('#importFile').setInputFiles(path);
  await expect(page.locator('#layoutSelect option')).toHaveText(['Base', 'Trial']);
  expect(await getState(page)).toEqual(moved);
  expect((await getSavedProject(page)).layouts).toHaveLength(2);
});
