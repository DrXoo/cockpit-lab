import { test, expect, openApp, importProject, getSavedProject } from './support.ts';

// The cockpit design is edited on its own (docs/adr/0001). Until the mini CAD is complete, no room
// includes it, and a new design starts empty (docs/adr/0004).

test('the cockpit editor starts empty, without layouts or room checks', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#cockpitEditor').click();
  await expect(page.locator('#cockpitEditor')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#emptyDesign')).toBeVisible();
  await expect(page.locator('#emptyScene')).toBeVisible();
  await expect(page.locator('.config-tabs')).toBeHidden();
  await expect(page.locator('#layoutArea')).toBeHidden();
  await expect(page.locator('#layoutBtn')).toBeHidden();
  await expect(page.locator('#roomInspector')).toBeHidden();
  await expect(page.locator('#validationBanner')).toBeHidden();
  await expect(page.locator('#cockpitChecksNote')).toBeVisible();
  await expect(page.locator('#importCockpit')).toBeVisible();
  await expect(page.locator('#exportCockpit')).toBeHidden();

  await page.locator('#roomEditor').click();
  await expect(page.locator('#layoutArea')).toBeVisible();
  await expect(page.locator('#roomInspector')).toBeVisible();
  await expect(page.locator('#validationBanner')).toBeVisible();
});

test('the room editor has no cockpit to place', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await expect(page.locator('.config-tabs [data-section]')).toHaveCount(3);
  await page.locator('#tab-desk').click();
  await expect(page.locator('#layoutTargetSelect option[value="cockpit"]')).toHaveCount(0);
  await expect(page.locator('#monitorPosition option[value="auto:cockpit"]')).toHaveCount(0);
});

test('a new project can start with the cockpit, leaving the room setup for later', async ({
  page,
}) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#newProject').click();
  await page.locator('#newProjectCockpit').click();
  await expect(page.locator('#cockpitEditor')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#emptyDesign')).toBeVisible();
  await expect.poll(async () => (await getSavedProject(page)).cockpit).toBeNull();
  expect((await getSavedProject(page)).setup.step).toBe('room');

  await page.locator('#roomEditor').click();
  await expect(page.locator('#setupRoomForm')).toBeVisible();
});

test('the first room step leads to the cockpit for those who only design one', async ({ page }) => {
  await openApp(page);
  await page.locator('#startWithCockpit').click();
  await expect(page.locator('#cockpitEditor')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#emptyDesign')).toBeVisible();
});
