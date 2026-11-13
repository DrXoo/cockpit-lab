import type { Page } from '@playwright/test';
import { test, expect, openApp, importProject, getState, getSavedProject } from './support.ts';

// The cockpit design is edited on its own; the room only places it (docs/adr/0001).

async function setNumber(page: Page, key: string, value: string) {
  await page.locator(`#${key}-number`).fill(value);
  await page.locator(`#${key}-number`).press('Enter');
}

test('the room only places the cockpit, and leads to its design', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-cockpit').click();
  await expect(page.locator('#controls [data-key="cockpitX"]').first()).toBeVisible();
  await expect(page.locator('#controls [data-key="length"]')).toHaveCount(0);

  await page.locator('#editCockpitDesign').click();
  await expect(page.locator('#cockpitEditor')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tab-frame')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#controls [data-key="length"]').first()).toBeVisible();
  await expect(page.locator('#controls [data-key="cockpitX"]')).toHaveCount(0);
});

test('the cockpit editor shows the design alone, without layouts or room checks', async ({
  page,
}) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#cockpitEditor').click();
  await expect(page.locator('#layoutArea')).toBeHidden();
  await expect(page.locator('#tab-room')).toBeHidden();
  await expect(page.locator('#layoutBtn')).toBeHidden();
  await expect(page.locator('[data-view="desk"]')).toBeHidden();
  await expect(page.locator('#roomInspector')).toBeHidden();
  await expect(page.locator('#deskSizeTag')).toBeHidden();
  await expect(page.locator('#heightTag')).toBeVisible();

  await page.locator('#roomEditor').click();
  await expect(page.locator('#layoutArea')).toBeVisible();
  await expect(page.locator('#roomInspector')).toBeVisible();
});

test('a change to the design shows in every layout of the room', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#duplicateLayout').click();
  await page.locator('#layoutName').fill('Second');
  await page.locator('#confirmLayoutName').click();

  await page.locator('#cockpitEditor').click();
  await setNumber(page, 'length', '160');
  await page.locator('#tab-posture').click();
  await setNumber(page, 'height', '186');
  await page.locator('#roomEditor').click();

  for (const layout of ['layout-1', 'layout-2']) {
    await page.locator('#layoutSelect').selectOption(layout);
    const state = await getState(page);
    expect([state.length, state.height]).toEqual([160, 186]);
  }
  await expect.poll(async () => (await getSavedProject(page)).cockpit?.length).toBe(160);
});

test('the room can leave the cockpit out and add it back where it was', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-cockpit').click();
  const placed = await getState(page);

  await page.locator('#leaveOutCockpit').click();
  expect((await getState(page)).cockpitEnabled).toBe(false);
  await expect(page.locator('#controls [data-key="cockpitX"]')).toHaveCount(0);
  await expect.poll(async () => (await getSavedProject(page)).cockpit?.preset).toBe('gt');
  await page.locator('#cockpitEditor').click();
  await expect(page.locator('#preset')).toHaveValue('gt');
  await page.locator('#roomEditor').click();

  await page.locator('#includeCockpit').click();
  const back = await getState(page);
  expect([back.cockpitEnabled, back.cockpitX, back.cockpitZ]).toEqual([
    true,
    placed.cockpitX,
    placed.cockpitZ,
  ]);
});

test('a new design joins the room only when it is added', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'desk-only.json');
  await page.locator('#tab-cockpit').click();
  await page.locator('#editCockpitDesign').click();
  await page.locator('#newDesignBase').selectOption('small');
  await page.locator('#newDesignForm [type="submit"]').click();
  await page.locator('#roomEditor').click();
  await page.locator('#tab-cockpit').click();
  expect((await getState(page)).cockpitEnabled).toBe(false);

  await page.locator('#includeCockpit').click();
  const state = await getState(page);
  expect([state.cockpitEnabled, state.preset]).toEqual([true, 'small']);
  expect(state.cockpitX).toBeGreaterThan(state.roomX);
  expect(state.cockpitX).toBeLessThan(state.roomX + state.roomW);
});

test('the posture check opens the posture of the design', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#adjustBody').click();
  await expect(page.locator('#cockpitEditor')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tab-posture')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#controls [data-key="height"]').first()).toBeVisible();
});

test('a cockpit can be designed without a room, and opens where it is designed', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('#cockpitEditor').click();
  await expect(page.locator('#emptyScene')).toBeVisible();
  await page.locator('#newDesignBase').selectOption('flight');
  await page.locator('#newDesignForm [type="submit"]').click();
  await expect(page.locator('#emptyScene')).toBeHidden();
  const state = await getState(page);
  expect([state.preset, state.roomEnabled]).toEqual(['flight', false]);

  await expect.poll(async () => (await getSavedProject(page)).cockpit?.preset).toBe('flight');
  await page.reload();
  await expect(page.locator('#cockpitEditor')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#preset')).toHaveValue('flight');
});
