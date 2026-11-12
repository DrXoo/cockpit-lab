import type { Page } from '@playwright/test';
import { test, expect, openApp, importProject, getState, getEvaluation } from './support.ts';

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

const position = (page: Page) => page.locator('#monitorPosition');
const savedPoses = (page: Page) =>
  page.locator('#monitorPosition optgroup[label="Your poses"] option');

async function openDesk(page: Page) {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('#tab-desk').click();
}

async function savePose(page: Page, name: string) {
  await page.locator('#armPoseName').fill(name);
  await page.locator('#saveArmPose').click();
}

async function setNumber(page: Page, key: string, value: string) {
  await page.locator(`#${key}-number`).fill(value);
  await page.locator(`#${key}-number`).press('Enter');
}

test('a saved pose is chosen in the monitor position and brings the arm back', async ({ page }) => {
  await openDesk(page);
  await expect(page.locator('#armPoseHint')).toBeVisible();
  await savePose(page, 'Racing');
  await expect(position(page)).toHaveValue('pose:pose-1');
  const saved = (await getState(page)).armPoses[0];
  const savedPoint = (await getEvaluation(page)).monitorPoint;

  await position(page).selectOption('auto:desk');
  expect((await getState(page)).monitorMode).toBe('desk');
  expect((await getEvaluation(page)).monitorPoint).not.toEqual(savedPoint);

  await position(page).selectOption('pose:pose-1');
  const state = await getState(page);
  expect(state.monitorMode).toBe('manual');
  expect(joints(state)).toEqual(joints(saved));
  expect((await getEvaluation(page)).monitorPoint).toEqual(savedPoint);

  await page.reload();
  await page.locator('#tab-desk').click();
  await expect(savedPoses(page)).toHaveText(['Racing']);
  await expect(position(page)).toHaveValue('pose:pose-1');
});

test('a pose can be updated after moving the arm, also after a reload', async ({ page }) => {
  await openDesk(page);
  await savePose(page, 'Racing');
  await page.reload();
  await page.locator('#tab-desk').click();
  await expect(page.locator('#updateArmPose')).toBeDisabled();

  await setNumber(page, 'monitorH', '120');
  await expect(position(page)).toHaveValue('pose:pose-1');
  await expect(savedPoses(page)).toHaveText(['Racing · changed']);
  await page.locator('#updateArmPose').click();

  await expect(savedPoses(page)).toHaveText(['Racing']);
  await expect(page.locator('#updateArmPose')).toBeDisabled();
  expect((await getState(page)).armPoses[0].monitorH).toBe(120);
});

test('each layout keeps its own poses', async ({ page }) => {
  await openDesk(page);
  await savePose(page, 'Racing');
  await page.locator('#duplicateLayout').click();
  await page.locator('#layoutName').fill('Trial');
  await page.locator('#confirmLayoutName').click();
  await page.locator('#tab-desk').click();
  await expect(savedPoses(page)).toHaveText(['Racing']);
  await setNumber(page, 'monitorH', '120');
  await savePose(page, 'Desk');
  await expect(savedPoses(page)).toHaveText(['Racing', 'Desk']);

  await page.locator('#layoutSelect').selectOption('layout-1');
  await page.locator('#tab-desk').click();
  await expect(savedPoses(page)).toHaveText(['Racing']);
});

test('the chosen pose can be deleted, and says when the arm mount has moved', async ({ page }) => {
  await openDesk(page);
  await savePose(page, 'Racing');
  await setNumber(page, 'monitorH', '120');
  await savePose(page, 'Desk');
  await page.locator('#deleteArmPose').click();
  await expect(savedPoses(page)).toHaveText(['Racing']);
  expect((await getState(page)).armPoses).toHaveLength(1);

  await position(page).selectOption('pose:pose-1');
  await expect(page.locator('[data-mount-moved]')).toHaveCount(0);
  await page.locator('#layoutTargetSelect').selectOption('arm');
  await setNumber(page, 'clampZ', '20');
  await expect(page.locator('[data-mount-moved="pose-1"]')).toBeVisible();
});
