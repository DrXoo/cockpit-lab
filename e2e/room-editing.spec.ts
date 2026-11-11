import { test, expect, openApp, importProject, getState, getEvaluation } from './support.ts';

test('furniture can be added, moved from the walls and deleted', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const before = await getState(page);
  await page.locator('#tab-furniture').click();
  await page.locator('[data-add-room="chair"]').click();

  const added = await getState(page);
  expect(added.roomFurniture).toHaveLength(before.roomFurniture.length + 1);
  const chair = added.roomFurniture.at(-1);
  expect(chair.type).toBe('chair');

  await page.locator('#room-x-number').fill('100');
  await page.locator('#room-x-number').press('Enter');
  const moved = (await getState(page)).roomFurniture.find(
    (item: { id: string }) => item.id === chair.id,
  );
  expect(moved.x).toBe(added.roomX + 100);

  await page.locator('#roomDelete').click();
  expect((await getState(page)).roomFurniture).toEqual(before.roomFurniture);
});

test('an opening can be moved to another wall', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-room').click();
  await page.locator('#roomTarget').selectOption('feature:window');
  await page.locator('#room-wall').selectOption('west');
  const window = (await getState(page)).roomFeatures.find(
    (item: { id: string }) => item.id === 'window',
  );
  expect(window.wall).toBe('west');
});

test('centring moves the desk and the cockpit to the middle of the room', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-room').click();
  await page.locator('#roomCenter').click();
  const state = await getState(page);
  const evaluation = await getEvaluation(page);
  expect((evaluation.allLeft + evaluation.allRight) / 2).toBeCloseTo(
    state.roomX + state.roomW / 2,
    0,
  );
  expect((evaluation.allBack + evaluation.allFront) / 2).toBeCloseTo(
    state.roomZ + state.roomD / 2,
    0,
  );
});
