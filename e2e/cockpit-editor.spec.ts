import type { Page } from '@playwright/test';
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

/** The design history the app autosaved in this browser. */
const savedHistory = async (page: Page) => (await getSavedProject(page))?.cockpit?.history;

async function startDesign(page: Page) {
  await openApp(page);
  await page.locator('#startWithCockpit').click();
  await page.locator('#addProfile').click();
}

/** Clicks the viewport at a fraction of its width and height. */
async function clickViewport(page: Page, x: number, y: number) {
  const canvas = page.locator('#viewport canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The viewport has no canvas');
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('the first profile starts the design, selected and shown in the view', async ({ page }) => {
  await startDesign(page);
  await expect(page.locator('#designHistory [data-part]')).toHaveCount(1);
  await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#emptyScene')).toBeHidden();
  await expect(page.locator('#partInspector')).toBeVisible();
  await expect(page.locator('#part-name')).toHaveValue('40 × 40 profile 1');
  await expect(page.locator('#part-lengthMm')).toHaveValue('500');
  await expect(page.locator('#exportCockpit')).toBeVisible();
  await expect.poll(() => savedHistory(page)).toHaveLength(1);
});

test('the inspector changes the operation that made the part', async ({ page }) => {
  await startDesign(page);
  await page.locator('#part-name').fill('Left rail');
  await page.locator('#part-name').press('Enter');
  await page.locator('#part-sectionId').selectOption('40x80');
  await page.locator('#part-lengthMm').fill('1200');
  await page.locator('#part-lengthMm').press('Enter');
  await page.locator('#part-startX').fill('-260');
  await page.locator('#part-startX').press('Enter');
  await expect
    .poll(async () => (await savedHistory(page))?.[0])
    .toMatchObject({
      name: 'Left rail',
      sectionId: '40x80',
      lengthMm: 1200,
      startMm: { x: -260, y: 20, z: 0 },
    });
  await expect(page.locator('#part-heightAxis')).toHaveValue('y');
  await expect(page.locator('#part-startX')).toBeFocused();
});

test('a value a profile cannot have is explained and not applied', async ({ page }) => {
  await startDesign(page);
  await page.locator('#part-lengthMm').fill('5');
  await page.locator('#part-lengthMm').press('Enter');
  await expect(page.locator('#toast')).toHaveClass(/visible/);
  await expect(page.locator('#part-lengthMm')).toHaveValue('500');
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBe(500);
});

test('undo and redo step through the edits of the session', async ({ page }) => {
  await startDesign(page);
  await page.locator('#part-lengthMm').fill('800');
  await page.locator('#part-lengthMm').press('Enter');
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBe(800);

  await page.locator('#viewport canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#part-lengthMm')).toHaveValue('500');
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBe(500);
  await page.keyboard.press('Control+y');
  await expect(page.locator('#part-lengthMm')).toHaveValue('800');

  await page.locator('#undoEdit').click();
  await page.locator('#undoEdit').click();
  await expect(page.locator('#emptyDesign')).toBeVisible();
  await expect(page.locator('#undoEdit')).toBeDisabled();
  await expect.poll(async () => (await getSavedProject(page)).cockpit).toBeNull();
  await page.locator('#redoEdit').click();
  await expect(page.locator('[data-part="part-1"]')).toBeVisible();
  await expect.poll(async () => (await savedHistory(page))?.[0].partId).toBe('part-1');
});

test('a step of the history selects the part it made', async ({ page }) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await expect(page.locator('[data-part="part-2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-part="part-1"]').click();
  await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-part="part-2"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#part-name')).toHaveValue('40 × 40 profile 1');
});

test('clicking a part in the view selects it, and clicking around it clears the selection', async ({
  page,
}) => {
  await startDesign(page);
  for (const view of ['top', 'side', 'iso']) {
    await page.locator(`[data-view="${view}"]`).click();
    await clickViewport(page, 0.05, 0.95);
    await expect(page.locator('#noPartSelected')).toBeVisible();
    await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'false');
    await clickViewport(page, 0.5, 0.5);
    await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');
  }
});

test('the side view belongs to the cockpit editor', async ({ page }) => {
  await startDesign(page);
  await expect(page.locator('[data-view="side"]')).toBeVisible();
  await page.locator('[data-view="side"]').click();
  await page.locator('#roomEditor').click();
  await expect(page.locator('[data-view="side"]')).toBeHidden();
  await expect(page.locator('[data-view="side"]')).toHaveAttribute('aria-pressed', 'false');
});

test('a profile grows out of the selected one, previewed until it is added', async ({ page }) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await expect(page.locator('#growPanel')).toBeVisible();
  await page.locator('#grow-face').selectOption('+x');
  await page.locator('#grow-lengthMm').fill('300');
  await page.locator('#grow-lengthMm').press('Enter');
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(1);
  await page.locator('#confirmGrowth').click();
  await expect(page.locator('#growPanel')).toBeHidden();
  await expect(page.locator('[data-part="part-2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'grow-profile', parentId: 'part-1', face: '+x', lengthMm: 300 });
  await expect(page.locator('#part-face')).toHaveValue('+x');
  await expect(page.locator('#part-startX')).toHaveCount(0);
});

test('Escape or Cancel leaves the design as it was', async ({ page }) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#growPanel')).toBeHidden();
  await page.locator('#growProfile').click();
  await page.locator('#cancelGrowth').click();
  await expect(page.locator('#growPanel')).toBeHidden();
  await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#designHistory [data-part]')).toHaveCount(1);
});

test('clicking a face of the parent grows the profile from there', async ({ page }) => {
  await startDesign(page);
  await page.locator('[data-view="side"]').click();
  await page.locator('#growProfile').click();
  await expect(page.locator('#grow-face')).toHaveValue('+y');
  await clickViewport(page, 0.5, 0.5);
  await expect(page.locator('#grow-face')).toHaveValue('-x');
  await expect(page.locator('#growPanel')).toBeVisible();
});

test('a part cannot change so that what grows out of it would hang off', async ({ page }) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#part-lengthMm').fill('100');
  await page.locator('#part-lengthMm').press('Enter');
  await expect(page.locator('#toast')).toHaveClass(/visible/);
  await expect(page.locator('#part-lengthMm')).toHaveValue('500');
});
