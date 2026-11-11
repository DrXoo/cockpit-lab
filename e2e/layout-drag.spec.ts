import type { Page } from '@playwright/test';
import { test, expect, openApp, importProject, getState, getEvaluation } from './support.ts';
import { cameraPose, sceneBounds, viewHeight, type SceneView } from '../src/scene-camera.ts';
import { inversePoint, transformPoint, type PlanPoint } from '../src/geometry.ts';

/** Maps world plan points to page pixels for a plan view, from the camera framing. */
async function planProjection(page: Page, view: SceneView) {
  const state = await getState(page);
  const evaluation = await getEvaluation(page);
  const box = await page.locator('#viewport canvas').boundingBox();
  if (!box) throw new Error('The scene canvas is not visible');
  const aspect = box.width / box.height;
  const framing = { state, evaluation, bounds: sceneBounds(state, evaluation) };
  const height = viewHeight(view, aspect, framing);
  const { target, up } = cameraPose(view, framing);
  // Looking down -Y, the screen's right is forward × up.
  const right = { x: -up.z, z: up.x };
  const pxPerCm = box.height / height;
  return {
    state,
    evaluation,
    pxPerCm,
    toScreen(p: PlanPoint) {
      const dx = p.x - target.x;
      const dz = p.z - target.z;
      return {
        x: box.x + box.width / 2 + (dx * right.x + dz * right.z) * pxPerCm,
        y: box.y + box.height / 2 - (dx * up.x + dz * up.z) * pxPerCm,
      };
    },
    toWorld(screen: { x: number; y: number }): PlanPoint {
      const along = (screen.x - box.x - box.width / 2) / pxPerCm;
      const upward = -(screen.y - box.y - box.height / 2) / pxPerCm;
      return {
        x: target.x + along * right.x + upward * up.x,
        z: target.z + along * right.z + upward * up.z,
      };
    },
  };
}

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: 4 });
  await page.mouse.up();
}

/** Layout editing moves desktop objects from the desk section, and room items from the room. */
async function startLayoutEditing(page: Page, section: 'room' | 'desk', view: SceneView) {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator(`#tab-${section}`).click();
  // The room section turns layout editing on by itself.
  const layout = page.locator('#layoutBtn');
  if ((await layout.getAttribute('aria-pressed')) !== 'true') await layout.click();
  await page.locator(`[data-view="${view}"]`).click();
  await expect(page.locator('#layoutBtn')).toHaveAttribute('aria-pressed', 'true');
}

test('dragging the cockpit in the plan moves it by the same distance', async ({ page }) => {
  await startLayoutEditing(page, 'room', 'top');
  const plan = await planProjection(page, 'top');
  const { state, evaluation } = plan;
  const middle = transformPoint(
    {
      x: (evaluation.rigLeft + evaluation.rigRight) / 2,
      z: (evaluation.lowerZ + evaluation.upperZ) / 2,
    },
    evaluation.rigPose,
  );
  const from = plan.toScreen(middle);
  const by = { x: 30, y: -20 };
  await drag(page, from, by);
  const moved = await getState(page);
  const end = plan.toWorld({ x: from.x + by.x, y: from.y + by.y });
  expect(moved.cockpitX).toBeCloseTo(state.cockpitX + end.x - middle.x, 0);
  expect(moved.cockpitZ).toBeCloseTo(state.cockpitZ + end.z - middle.z, 0);
  expect(moved.deskX).toBe(state.deskX);
});

test('dragging a desktop object in the desk view moves it on the desk', async ({ page }) => {
  await startLayoutEditing(page, 'desk', 'desk');
  const plan = await planProjection(page, 'desk');
  const { state, evaluation } = plan;
  const keyboard = evaluation.desktopItems.find((item: { id: string }) => item.id === 'keyboard');
  const from = plan.toScreen(keyboard.world);
  const by = { x: 12, y: 8 };
  await drag(page, from, by);
  const moved = await getState(page);
  const start = inversePoint(keyboard.world, evaluation.deskPose);
  const end = inversePoint(
    plan.toWorld({ x: from.x + by.x, y: from.y + by.y }),
    evaluation.deskPose,
  );
  expect(moved.keyboardX).toBeCloseTo(state.keyboardX + end.x - start.x, 0);
  expect(moved.keyboardZ).toBeCloseTo(state.keyboardZ + end.z - start.z, 0);
  expect([moved.deskX, moved.deskZ]).toEqual([state.deskX, state.deskZ]);
});
