import type { Page } from '@playwright/test';
import { test, expect, openApp, importProject, getState } from './support.ts';

interface Joints {
  armBaseAngle: number;
  armElbowAngle: number;
  monitorYaw: number;
  monitorH: number;
}

const joints = ({ armBaseAngle, armElbowAngle, monitorYaw, monitorH }: Joints): Joints => ({
  armBaseAngle,
  armElbowAngle,
  monitorYaw,
  monitorH,
});

async function openDesk(page: Page) {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-desk').click();
}

async function savePose(page: Page, name: string) {
  await page.locator('#armPoseName').fill(name);
  await page.locator('#saveArmPose').click();
}

test('a saved pose brings the arm back to the same joints, also after a reload', async ({
  page,
}) => {
  await openDesk(page);
  await expect(page.locator('#armPoseHint')).toBeVisible();
  await savePose(page, 'Racing');
  const saved = (await getState(page)).armPoses[0];

  await page.locator('#monitorMode').selectOption('desk');
  expect(joints(await getState(page))).not.toEqual(joints(saved));

  const racing = page.locator('[data-arm-pose="pose-1"]');
  await expect(racing).toHaveAttribute('aria-pressed', 'false');
  await racing.click();
  const state = await getState(page);
  expect(state.monitorMode).toBe('manual');
  expect(joints(state)).toEqual(joints(saved));
  await expect(page.locator('[data-arm-pose="pose-1"]')).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await page.locator('#tab-desk').click();
  await expect(page.locator('[data-arm-pose]')).toHaveText(['Racing']);
  await expect(page.locator('[data-arm-pose="pose-1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('each layout keeps its own poses', async ({ page }) => {
  await openDesk(page);
  await savePose(page, 'Racing');
  await page.locator('#duplicateLayout').click();
  await page.locator('#layoutName').fill('Trial');
  await page.locator('#confirmLayoutName').click();
  await page.locator('#tab-desk').click();
  await expect(page.locator('[data-arm-pose]')).toHaveText(['Racing']);
  await savePose(page, 'Desk');
  await expect(page.locator('[data-arm-pose]')).toHaveText(['Racing', 'Desk']);

  await page.locator('#layoutSelect').selectOption('layout-1');
  await page.locator('#tab-desk').click();
  await expect(page.locator('[data-arm-pose]')).toHaveText(['Racing']);
});

test('a pose can be deleted, and says when the arm mount has moved', async ({ page }) => {
  await openDesk(page);
  await savePose(page, 'Racing');
  await savePose(page, 'Desk');
  await page.locator('[data-delete-arm-pose="pose-2"]').click();
  await expect(page.locator('[data-arm-pose]')).toHaveText(['Racing']);
  expect((await getState(page)).armPoses).toHaveLength(1);

  await expect(page.locator('[data-mount-moved]')).toHaveCount(0);
  await page.locator('#layoutTargetSelect').selectOption('arm');
  await page.locator('#clampZ-number').fill('20');
  await page.locator('#clampZ-number').press('Enter');
  await expect(page.locator('[data-mount-moved="pose-1"]')).toBeVisible();
});
