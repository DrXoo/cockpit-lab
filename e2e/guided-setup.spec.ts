import { test, expect, openApp, getState, getSavedProject, activeLayoutConfig } from './support.ts';

test('the guided setup builds a room, an opening and a desk, and no cockpit', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('body')).toHaveAttribute('data-guided', 'true');
  await expect(page.locator('#setupProgress [data-step]')).toHaveCount(4);

  // Room
  await page.locator('#setupRoomW').fill('340');
  await page.locator('#setupRoomD').fill('320');
  await page.locator('#setupNext').click();
  expect(await getState(page)).toMatchObject({ roomEnabled: true, roomW: 340, roomD: 320 });

  // Openings
  await page.locator('[data-add-room="door"]').click();
  expect((await getState(page)).roomFeatures).toHaveLength(1);
  await page.locator('#setupNext').click();

  // Furniture: skipped for later
  await page.locator('#setupSkip').click();

  // Desk, the last step, with the monitor position and the arm poses
  await page.locator('#setupDeskW').fill('140');
  await page.locator('#setupDeskD').fill('70');
  await page.locator('#setupDeskH').fill('75');
  await page.locator('#setupDeskForm [type="submit"]').click();
  expect(await getState(page)).toMatchObject({
    deskEnabled: true,
    deskWidth: 140,
    deskDepth: 70,
    deskH: 75,
  });
  await page.locator('#monitorEnabled').check();
  await expect(page.locator('#monitorPosition')).toHaveValue('auto:desk');
  await expect(page.locator('#controls [data-monitor-pose]')).toHaveCount(0);
  await page.locator('#setupNext').click();

  await expect(page.locator('body')).toHaveAttribute('data-guided', 'false');
  await expect(page.locator('#toast')).toHaveText('Project ready. You can keep editing each part.');
  const saved = await getSavedProject(page);
  expect(saved.setup).toMatchObject({ step: 'complete', deferred: ['furniture'] });
  expect(saved.cockpit).toBeNull();
  expect(activeLayoutConfig(saved)).toEqual(await getState(page));
  await page.locator('#tab-cockpit').click();
  await expect(page.locator('#editCockpitDesign')).toBeVisible();
});

test('a half-finished setup resumes at the same step after a reload', async ({ page }) => {
  await openApp(page);
  await page.locator('#setupRoomW').fill('300');
  await page.locator('#setupRoomD').fill('280');
  await page.locator('#setupNext').click();
  await page.locator('[data-add-room="window"]').click();

  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-guided', 'true');
  expect((await getSavedProject(page)).setup.step).toBe('openings');
  const state = await getState(page);
  expect(state).toMatchObject({ roomW: 300, roomD: 280 });
  expect(state.roomFeatures.map((feature: { type: string }) => feature.type)).toEqual(['window']);
});

test('a typed but unconfirmed room size survives a reload as a draft', async ({ page }) => {
  await openApp(page);
  await page.locator('#setupRoomW').fill('410');
  await expect.poll(async () => (await getSavedProject(page))?.setup.drafts?.room?.w).toBe('410');
  await page.reload();
  await expect(page.locator('#setupRoomW')).toHaveValue('410');
});
