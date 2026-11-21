import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect, openApp, importProject, getSavedProject, cockpitFileOf } from './support.ts';
import { anchoredProfiles, seatRails } from '../tests/support/designs.ts';
import { editProfile, type Operation } from '../src/cockpit/cad/history/history.ts';

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
  await expect(page.locator('#cockpitChecksSection')).toBeHidden();
  await expect(page.locator('#importCockpit')).toBeVisible();
  await expect(page.locator('#exportCockpit')).toBeHidden();
  await expect(page.locator('#undoEdit')).toHaveCount(0);

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

/** Opens the cockpit editor with one profile: part-1, made by op-1. */
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

/** Moves the pointer over the viewport, without pressing, to a fraction of its width and height. */
async function hoverViewport(page: Page, x: number, y: number) {
  const canvas = page.locator('#viewport canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The viewport has no canvas');
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
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

test('the selected part shows its length in the view while dimensions are shown', async ({
  page,
}) => {
  await startDesign(page);
  const length = page.locator('#sceneLabels [data-measures="part-length"]');
  await expect(length).toHaveText('500 mm');
  await page.locator('#part-lengthMm').fill('1200');
  await page.locator('#part-lengthMm').press('Enter');
  await expect(length).toHaveText('1200 mm');
  await page.locator('#dimensionBtn').click();
  await expect(length).toBeHidden();
  await page.locator('#dimensionBtn').click();
  await clickViewport(page, 0.05, 0.95);
  await expect(length).toHaveCount(0);
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
    await expect(page.locator('#part-name')).toHaveValue('40 × 40 profile 1');
    // A part picked in the view leaves the history as it is, until its step is asked for.
    await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#showInHistory').click();
    await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#showInHistory')).toHaveCount(0);
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

test('a part changed so that what grows out of it would hang off fails that step', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#part-lengthMm').fill('100');
  await page.locator('#part-lengthMm').press('Enter');
  await expect(page.locator('[data-operation="op-2"]')).toHaveClass(/failed/);
  await expect(page.locator('[data-operation="op-2"] .history-failure')).toBeVisible();
  await page.locator('#undoEdit').click();
  await expect(page.locator('[data-operation="op-2"]')).not.toHaveClass(/failed/);
});

test('a part is made the root of a subassembly, renamed and ungrouped from its inspector', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  const savedSubassemblies = async () => (await getSavedProject(page))?.cockpit?.subassemblies;
  await expect(page.locator('#ungroupSubassembly')).toHaveCount(0);

  await page.locator('#makeSubassembly').click();
  await expect.poll(savedSubassemblies).toEqual([{ name: '40 × 40 profile 2', rootId: 'part-2' }]);
  await expect(page.locator('[data-operation="op-2"] [data-subassembly-tag]')).toBeVisible();
  await expect(page.locator('[data-operation="op-1"] [data-subassembly-tag]')).toHaveCount(0);
  await expect(page.locator('[data-check="cad-subassembly-dependents"]')).toHaveClass(/ok/);
  await page.locator('#subassemblyName').fill('Wheel deck');
  await page.locator('#subassemblyName').press('Enter');
  await expect.poll(savedSubassemblies).toEqual([{ name: 'Wheel deck', rootId: 'part-2' }]);

  // A part grown out of the root belongs to the subassembly, and can root a nested one.
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  await expect(page.locator('[data-operation="op-3"] [data-subassembly-tag]')).toBeVisible();
  await expect(page.locator('#makeSubassembly')).toBeVisible();

  await page.locator('[data-part="part-2"]').click();
  await page.locator('#ungroupSubassembly').click();
  await expect.poll(savedSubassemblies).toBeUndefined();
  await expect(page.locator('[data-subassembly-tag]')).toHaveCount(0);
  await expect(page.locator('[data-check="cad-subassembly-dependents"]')).toHaveCount(0);
  expect(await savedHistory(page)).toHaveLength(3);
  await page.locator('#undoEdit').click();
  await expect.poll(savedSubassemblies).toEqual([{ name: 'Wheel deck', rootId: 'part-2' }]);
});

test('modes are added in the Modes panel, take subassemblies off and are chosen in the view', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  const saved = async () => (await getSavedProject(page))?.cockpit;
  await expect(page.locator('#modesSection')).toBeHidden();
  await page.locator('#makeSubassembly').click();
  await expect(page.locator('#noModes')).toBeVisible();
  await expect(page.locator('#modeShown')).toBeHidden();

  await page.locator('#addMode').click();
  await expect
    .poll(async () => (await saved())?.modes)
    .toEqual([{ id: 'mode-1', name: 'Mode 1', takenOff: [] }]);
  await expect(page.locator('#modeShown')).toHaveValue('mode-1');
  await page.locator('[data-mode-name="mode-1"]').fill('Flight');
  await page.locator('[data-mode-name="mode-1"]').press('Enter');
  await page.locator('input[data-mode="mode-1"][data-root="part-2"]').uncheck();
  await expect
    .poll(async () => (await saved())?.modes)
    .toEqual([{ id: 'mode-1', name: 'Flight', takenOff: ['part-2'] }]);
  await expect(page.locator('#modeShown option[value="mode-1"]')).toHaveText('Flight');
  await expect(page.locator('[data-check="cad-modes"]')).toHaveCount(0);

  // The part taken off is a ghost while selected, and its inspector says so.
  await page.locator('[data-operation="op-2"]').click();
  await expect(page.locator('#partOffInMode')).toBeVisible();
  await page.locator('#modeShown').selectOption('');
  await expect.poll(async () => (await saved())?.shownModeId).toBeUndefined();
  await expect(page.locator('#partOffInMode')).toHaveCount(0);
  await expect(page.locator('[data-check="cad-modes"]')).toBeVisible();
  await expect(page.locator('[data-check="cad-interference"]')).toHaveCount(0);

  await page.locator('#addMode').click();
  await expect(page.locator('#modeShown')).toHaveValue('mode-2');
  await expect(page.locator('[data-check="cad-modes"]')).toBeVisible();
  await page.locator('[data-delete-mode="mode-2"]').click();
  await expect(page.locator('#modeShown')).toHaveValue('');

  // Ungrouping a subassembly takes it out of every mode.
  await page.locator('#ungroupSubassembly').click();
  await expect
    .poll(async () => (await saved())?.modes)
    .toEqual([{ id: 'mode-1', name: 'Flight', takenOff: [] }]);
  await expect(page.locator('#modesSection')).toBeHidden();
});

test('a profile can lie along a face instead of growing out of it', async ({ page }) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#grow-way').selectOption('+x');
  await page.locator('#confirmGrowth').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'grow-profile', face: '+y', way: '+x' });
  await page.locator('#part-face').selectOption('+x');
  await expect(page.locator('#part-way')).toHaveValue('+z');
});

test('a profile about to grow turns from its box in the view, or with R, across its parent first', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  const way = page.locator('#grow-way');
  await expect(way).toHaveValue('out');
  await page.locator('#turnDraftInView').click();
  await expect(way).toHaveValue('+x');
  await expect(page.locator('#grow-acrossMm')).toHaveValue('-20');
  await page.keyboard.press('r');
  await expect(way).toHaveValue('-x');
  await page.locator('#confirmDraftInView').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'grow-profile', way: '-x', acrossMm: 20 });
});

test('a peripheral about to be mounted has no turn in its box', async ({ page }) => {
  await startDesign(page);
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountPedals').click();
  await expect(page.locator('#draftBox')).toBeVisible();
  await expect(page.locator('#turnDraftInView')).toBeHidden();
});

test('B grows out of A and reaches C; moving C changes B, and B lets go keeping its length', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#growProfile').click();
  await page.locator('#grow-face').selectOption('+x');
  await page.locator('#confirmGrowth').click();
  await page.locator('#part-reachesId').selectOption('part-2');
  await expect(page.locator('#part-lengthMm')).toBeDisabled();
  await expect(page.locator('#part-lengthMm')).toHaveValue('60');
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ reachesId: 'part-2', lengthMm: 60 });

  await page.locator('[data-part="part-2"]').click();
  await page.locator('#part-startX').fill('300');
  await page.locator('#part-startX').press('Enter');
  await expect.poll(async () => (await savedHistory(page))?.[2].lengthMm).toBe(260);

  await page.locator('[data-part="part-3"]').click();
  await page.locator('#part-reachesId').selectOption('');
  await expect(page.locator('#part-lengthMm')).toBeEnabled();
  await expect(page.locator('#part-lengthMm')).toHaveValue('260');
  await expect.poll(async () => (await savedHistory(page))?.[2].reachesId).toBeUndefined();
});

test('removing a part is a step, and deleting that step brings the part back', async ({ page }) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#removePart').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toEqual({ kind: 'remove-part', id: 'op-3', removedId: 'part-1' });
  await page.locator('[data-part="part-2"]').click();
  await expect(page.locator('#removePart')).toBeVisible();
  await expect(page.locator('#partInspectorBody .part-warning')).toHaveCount(0);

  await page.locator('[data-operation="op-3"]').click();
  await page.locator('#deleteStep').click();
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(2);
});

test('deleting a step fails the steps that relied on it, and keeps the others', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  await page.locator('#addProfile').click();
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#deleteStep').click();
  await expect(page.locator('[data-operation="op-2"]')).toHaveClass(/failed/);
  await expect(page.locator('[data-operation="op-3"]')).not.toHaveClass(/failed/);
  await page.locator('[data-operation="op-2"]').click();
  await expect(page.locator('#partInspectorBody .part-warning')).toBeVisible();
  await expect(page.locator('#removePart')).toBeHidden();
});

test('the history marker shows an earlier step, and new steps go in there', async ({ page }) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('#markerBack').click();
  await expect(page.locator('[data-operation="op-2"]')).toBeDisabled();
  await page.locator('#addProfile').click();
  await expect
    .poll(async () => (await savedHistory(page))?.map((operation: { id: string }) => operation.id))
    .toEqual(['op-1', 'op-3', 'op-2']);
  await expect(page.locator('[data-operation="op-2"]')).toBeDisabled();
  await page.locator('#markerEnd').click();
  await expect(page.locator('[data-operation="op-2"]')).toBeEnabled();
  await expect(page.locator('#markerForward')).toBeDisabled();
});

test('the inspector checks the whole design and lists the parts to buy', async ({ page }) => {
  await startDesign(page);
  await expect(page.locator('#cockpitChecksNote')).toBeHidden();
  await expect(page.locator('#cockpitChecks [data-check="cad-support"]')).toHaveClass(/warning/);
  await expect(page.locator('#cockpitChecks [data-check="cad-failed-steps"]')).toHaveClass(/ok/);
  await expect(page.locator('#partsToBuy [data-buy="cut"]')).toHaveCount(1);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  await expect(page.locator('#cockpitChecks [data-check="cad-pending-joints"]')).toHaveClass(
    /warning/,
  );
  await expect(page.locator('#partsPending')).toBeVisible();
  await expect(page.locator('#partsToBuy [data-buy="cut"]')).toHaveCount(1);
  await expect(page.locator('#wholeDesignNote')).toBeHidden();
  await page.locator('#markerBack').click();
  await expect(page.locator('#wholeDesignNote')).toBeVisible();
});

test('feet go under a profile as steps, and the design then stands on them', async ({ page }) => {
  await startDesign(page);
  await page.locator('#addFoot').click();
  await expect(page.locator('[data-operation="op-2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#part-footTypeId')).toHaveValue('leveling-foot');
  await page.locator('#part-footTypeId').selectOption('locking-caster');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'add-foot', parentId: 'part-1', footTypeId: 'locking-caster' });
  await page.locator('[data-operation="op-1"]').click();
  await page.locator('#addFoot').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'add-foot', fromEnd: 'end' });
  await expect(page.locator('#cockpitChecks [data-check="cad-support"]')).toHaveClass(/ok/);
  await expect(page.locator('#partsToBuy [data-buy="foot"]')).toHaveCount(2);
});

test('a joint is fastened with corner brackets from the inspector of either part', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  const joint = page.locator('[data-joint-row="part-2@part-1"]');
  await expect(joint).toBeVisible();
  await page.locator('[data-joint-brackets="part-2@part-1"]').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'fasten-joint', partId: 'part-2', toPartId: 'part-1' });
  await expect(page.locator('#cockpitChecks [data-check="cad-pending-joints"]')).toHaveClass(/ok/);
  await expect(page.locator('#partsToBuy [data-buy="connector"]')).toHaveCount(1);
  await expect(page.locator('#partsToBuy [data-buy="fastener"]')).toHaveCount(2);

  await page.locator('[data-operation="op-1"]').click();
  const sides = page.locator('[data-joint="part-2@part-1"][aria-pressed="true"]');
  await expect(sides).toHaveCount(2);
  await sides.first().click();
  await expect.poll(async () => (await savedHistory(page))?.[2]?.connectors?.length).toBe(1);
  await page.locator('[data-joint="part-2@part-1"][aria-pressed="true"]').click();
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(2);
  await expect(page.locator('#cockpitChecks [data-check="cad-pending-joints"]')).toHaveClass(
    /warning/,
  );
});

test('two parts that only touch are joined, and the joint takes brackets', async ({ page }) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('#part-axis').selectOption('y');
  for (const [field, value] of [
    ['startX', '0'],
    ['startY', '40'],
    ['startZ', '250'],
  ]) {
    await page.locator(`#part-${field}`).fill(value);
    await page.locator(`#part-${field}`).press('Enter');
  }
  await page.locator('[data-join="part-1"]').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'join-parts', partId: 'part-2', toPartId: 'part-1' });
  await expect(page.locator('#touchingParts')).toHaveCount(0);
  await page.locator('[data-joint-brackets="part-2@part-1"]').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[3])
    .toMatchObject({ kind: 'fasten-joint', partId: 'part-2', toPartId: 'part-1' });
});

test('the measure tool gives the offsets between two clicked points, without saving them', async ({
  page,
}) => {
  await startDesign(page);
  await expect.poll(() => savedHistory(page)).toHaveLength(1);
  const saved = JSON.stringify(await getSavedProject(page));
  await page.locator('[data-view="top"]').click();
  await page.locator('#dimensionBtn').click();
  await page.locator('#measureBtn').click();
  await expect(page.locator('#measureBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#measureReadout')).toBeVisible();

  await clickViewport(page, 0.5, 0.45);
  await clickViewport(page, 0.5, 0.55);
  // Lower on the screen of the top view is the front.
  await expect(page.locator('#measureReadout')).toContainText(/Z \d+(\.\d)? mm to the front/);
  await expect(page.locator('#sceneLabels [data-measures="offset-z"]')).toBeVisible();
  await expect(page.locator('#sceneLabels [data-measures="offset-x"]')).toHaveCount(0);
  // Clicks measure instead of selecting.
  await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(page.locator('#measureReadout')).toBeHidden();
  await expect(page.locator('#sceneLabels [data-measures="offset-z"]')).toHaveCount(0);
  await expect(page.locator('#measureBtn')).toHaveAttribute('aria-pressed', 'false');
  expect(JSON.stringify(await getSavedProject(page))).toBe(saved);
});

test('a measurement starts again when the design changes', async ({ page }) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  await page.locator('#measureBtn').click();
  await clickViewport(page, 0.5, 0.45);
  await expect(page.locator('#measureReadout')).toContainText(/second point/);
  await page.locator('#part-lengthMm').fill('800');
  await page.locator('#part-lengthMm').press('Enter');
  await expect(page.locator('#measureReadout')).toContainText(/Click a point on a part/);
});

test('a plate rests on the selected profile, previewed until it is added', async ({ page }) => {
  await startDesign(page);
  await page.locator('[data-view="side"]').click();
  await page.locator('#putPlate').click();
  await expect(page.locator('#platePanel')).toBeVisible();
  await expect(page.locator('#plate-face')).toHaveValue('+y');
  await clickViewport(page, 0.5, 0.5);
  await expect(page.locator('#plate-face')).toHaveValue('-x');
  await page.locator('#plate-widthMm').fill('200');
  await page.locator('#plate-widthMm').press('Enter');
  await expect(page.locator('#plate-widthMm')).toHaveValue('200');
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(1);
  await page.locator('#confirmPlate').click();
  await expect(page.locator('#platePanel')).toBeHidden();
  await expect(page.locator('[data-part="part-2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({
      kind: 'add-plate',
      parentId: 'part-1',
      face: '-x',
      widthMm: 200,
      depthMm: 300,
      sheetId: 'aluminium-8',
    });
  await expect(page.locator('#part-sheetId')).toHaveValue('aluminium-8');
  await expect(page.locator('#growProfile')).toBeHidden();
  await expect(page.locator('#partsToBuy [data-buy="plate"]')).toHaveCount(1);
});

test('a plate is selected in the view and edited, but never moved off its face', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#putPlate').click();
  await page.locator('#confirmPlate').click();
  await page.locator('[data-operation="op-1"]').click();
  await page.locator('[data-view="top"]').click();
  // The marker of the plate's joint sits at its center, over the rail: click beside it.
  await clickViewport(page, 0.42, 0.5);
  await expect(page.locator('#part-sheetId')).toBeVisible();
  await page.locator('#part-acrossMm').fill('400');
  await page.locator('#part-acrossMm').press('Enter');
  await expect(page.locator('#toast')).toContainText(/would not rest on/);
  await expect(page.locator('#part-acrossMm')).toHaveValue('0');
  await page.locator('#part-sheetId').selectOption('aluminium-4');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'add-plate', sheetId: 'aluminium-4', acrossMm: 0 });
});

test('a plate is joined to the profiles it touches and bolted into their slots', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('[data-operation="op-1"]').click();
  await page.locator('#putPlate').click();
  await page.locator('#plate-acrossMm').fill('50');
  await page.locator('#plate-acrossMm').press('Enter');
  await expect(page.locator('#plate-acrossMm')).toHaveValue('50');
  await page.locator('#confirmPlate').click();
  await page.locator('[data-join="part-2"]').click();
  await expect(page.locator('[data-joint-row="part-3@part-2"]')).toBeVisible();
  await page.locator('[data-joint-two-bolts="part-3@part-1"]').click();
  await page.locator('[data-joint-bolts="part-3@part-2"]').fill('3');
  await page.locator('[data-joint-bolts="part-3@part-2"]').press('Enter');
  await expect
    .poll(async () => (await savedHistory(page))?.slice(4))
    .toMatchObject([
      { kind: 'fasten-joint', partId: 'part-3', toPartId: 'part-1', connectors: [{ perSlot: 2 }] },
      { kind: 'fasten-joint', partId: 'part-3', toPartId: 'part-2', connectors: [{ perSlot: 3 }] },
    ]);
  await expect(page.locator('#cockpitChecks [data-check="cad-pending-joints"]')).toHaveClass(/ok/);
  await expect(page.locator('#partsPending')).toHaveCount(0);
  await expect(page.locator('#partsToBuy [data-buy="fastener"]')).toHaveCount(2);
  await page.locator('[data-joint-bolts="part-3@part-2"]').fill('0');
  await page.locator('[data-joint-bolts="part-3@part-2"]').press('Enter');
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(5);
});

test('a selected plate is shown as a drawing with its holes, in place of the 3D view', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-operation="op-1"]').click();
  await expect(page.locator('#drawingView')).toBeDisabled();
  await page.locator('#putPlate').click();
  await page.locator('#confirmPlate').click();
  await page.locator('[data-joint-two-bolts="part-2@part-1"]').click();
  await page.locator('[data-part="part-2"]').click();
  await page.locator('#drawingView').click();
  await expect(page.locator('#drawingView')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-view="iso"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#plateDrawingView')).toBeVisible();
  const holes = page.locator('#plateDrawingSheet [data-kind="fastening"]');
  await expect(holes).toHaveCount(2);
  const described = page.locator('#plateDrawingHole');
  const hint = await described.textContent();
  await holes.first().click();
  await expect(holes.first()).toHaveClass(/chosen/);
  await expect(described).not.toHaveText(hint ?? '');

  await page.locator('[data-part="part-1"]').click();
  await expect(page.locator('#plateDrawingView')).toBeHidden();
  await expect(page.locator('[data-view="iso"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-part="part-2"]').click();
  await page.locator('#drawingView').click();
  await page.locator('[data-view="top"]').click();
  await expect(page.locator('#plateDrawingView')).toBeHidden();
  await expect(page.locator('#drawingView')).toHaveAttribute('aria-pressed', 'false');
});

test("a plate's inspector downloads its DXF and its drilling template", async ({ page }) => {
  await startDesign(page);
  await page.locator('[data-operation="op-1"]').click();
  await page.locator('#putPlate').click();
  await page.locator('#confirmPlate').click();
  await page.locator('[data-joint-two-bolts="part-2@part-1"]').click();
  await page.locator('[data-part="part-2"]').click();

  const [dxf] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportPlateDxf').click(),
  ]);
  expect(dxf.suggestedFilename()).toMatch(/ - Aluminium sheet, \d+ mm - .+\.dxf$/);
  const dxfText = await readFile(await dxf.path(), 'utf8');
  expect(dxfText.match(/^CIRCLE$/gm)).toHaveLength(2);

  const [template] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportPlateSvg').click(),
  ]);
  expect(template.suggestedFilename()).toMatch(/\.svg$/);
  const svg = await readFile(await template.path(), 'utf8');
  expect(svg).toContain('class="scale-bar"');
});

test('fitting, a seat on a plate runs on its rails or in slots, which the plate drawing shows', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-operation="op-1"]').click();
  await page.locator('#putPlate').click();
  await page.locator('#confirmPlate').click();
  await page.locator('#fitModeBtn').click();
  await page.locator('[data-part="part-2"]').click();
  await page.locator('#mountSeat').click();
  await page.locator('#confirmPeripheral').click();
  await expect(page.locator('#adjustmentRunsOn')).toHaveValue('rails');
  await page.locator('#adjustmentRunsOn').selectOption('slots');
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'mount-peripheral', adjustment: { runsOn: 'slots' } });
  await page.locator('[data-part="part-2"]').click();
  await page.locator('#drawingView').click();
  await expect(page.locator('#plateDrawingSheet .slot-outline')).toHaveCount(4);
  await expect(page.locator('#plateDrawingSheet circle')).toHaveCount(0);

  await expect(page.locator('#cockpitChecks [data-check="cad-uncut-slots"]')).toHaveClass(/ok/);
  await page.locator('#fitModeBtn').click();
  await page.locator('#part-processId').selectOption('hand-drilling');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'add-plate', processId: 'hand-drilling' });
  await expect(page.locator('#cockpitChecks [data-check="cad-uncut-slots"]')).toHaveClass(
    /warning/,
  );
  await page.locator('[data-view="iso"]').click();
  await page.locator('#drawingView').click();
  await expect(page.locator('#plateDrawingSheet .has-problem')).toHaveCount(4);
});

test('Delete removes a part picked in the view, and deletes a step chosen in the history', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  await clickViewport(page, 0.5, 0.5);
  await expect(page.locator('#showInHistory')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'remove-part', removedId: 'part-1' });
  await page.locator('[data-operation="op-2"]').click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(1);
  // Typing in a field, Delete edits the field.
  await page.locator('[data-operation="op-1"]').click();
  await page.locator('#part-name').focus();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(1);
  await page.locator('[data-operation="op-1"]').click();
  await page.keyboard.press('Delete');
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(0);
});

test('the part under the pointer is named beside it once the pointer rests there', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  await hoverViewport(page, 0.5, 0.5);
  await expect(page.locator('#hoverLabel')).toBeVisible();
  await expect(page.locator('#hoverLabel')).toHaveAttribute('data-part', 'part-1');
  await expect(page.locator('#hoverLabel')).toHaveText('40 × 40 profile 1 · 40 × 40 · 500 mm');
  await hoverViewport(page, 0.05, 0.05);
  await expect(page.locator('#hoverLabel')).toBeHidden();
});

/** Drags a handle of the selected part by a number of pixels on screen. */
async function dragHandle(page: Page, handle: string, dx: number, dy: number, modifier?: string) {
  const ball = await page.locator(`[data-handle="${handle}"]`).boundingBox();
  if (!ball) throw new Error(`No handle ${handle}`);
  const x = ball.x + ball.width / 2;
  const y = ball.y + ball.height / 2;
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
  if (modifier) await page.keyboard.up(modifier);
}

test('dragging an end of a profile previews its new length, typed and confirmed in a box', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  await expect(page.locator('[data-handle-kind="end"]')).toHaveCount(2);
  // In the top view, the front (+Z) end of a rail is towards the bottom of the screen.
  await dragHandle(page, 'part-1:end', 0, 60);
  await expect(page.locator('#changeBox')).toBeVisible();
  await expect(page.locator('#changeBox')).toHaveAttribute('data-kind', 'change');
  const dragged = Number(await page.locator('#changeValue').inputValue());
  expect(dragged).toBeGreaterThan(0);
  expect(dragged % 10).toBe(0);
  await expect(page.locator('[data-handle]')).toHaveCount(1);
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBe(500);

  await clickViewport(page, 0.05, 0.05);
  await expect(page.locator('[data-part="part-1"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#changeValue').fill('120');
  await page.locator('#changeValue').press('Enter');
  await expect(page.locator('#changeBox')).toBeHidden();
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBe(620);
  await expect(page.locator('#part-lengthMm')).toHaveValue('620');
});

test('Escape or undo leaves a dragged profile as it was; Shift drags both ends', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  await dragHandle(page, 'part-1:start', 0, -60);
  await expect(page.locator('#changeBox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#changeBox')).toBeHidden();
  await dragHandle(page, 'part-1:start', 0, -60);
  await page.locator('#viewport canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#changeBox')).toBeHidden();
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(1);
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBe(500);

  await dragHandle(page, 'part-1:end', 0, 60, 'Shift');
  await expect(page.locator('#changeBox')).toHaveAttribute('data-kind', 'length');
  await page.locator('#confirmChange').click();
  await expect.poll(async () => (await savedHistory(page))?.[0].lengthMm).toBeGreaterThan(500);
  const [rail] = (await savedHistory(page)) ?? [];
  expect(rail.startMm.z).toBe(-(rail.lengthMm - 500) / 2);
});

test('dragging an arrow of a profile moves it, by a distance typed and confirmed in a box', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  // The top view looks down Y: the rail moves along X and Z there, not up.
  await expect(page.locator('[data-handle-kind="move"]')).toHaveCount(2);
  await expect(page.locator('[data-handle="part-1:move:y"]')).toHaveCount(0);
  await dragHandle(page, 'part-1:move:x', 60, 0);
  await expect(page.locator('#changeBox')).toHaveAttribute('data-kind', 'move');
  const moved = Number(await page.locator('#changeValue').inputValue());
  expect(moved).not.toBe(0);
  expect(moved % 10).toBe(0);
  await expect(page.locator('[data-handle]')).toHaveCount(1);

  await page.locator('#changeValue').fill('-75');
  await page.keyboard.press('Enter');
  await expect(page.locator('#changeBox')).toBeHidden();
  await expect.poll(async () => (await savedHistory(page))?.[0].startMm.x).toBe(-75);
  await expect(page.locator('#part-startX')).toHaveValue('-75');
});

test('dragging an edge of a plate widens it on both sides, or with Shift on that side', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#putPlate').click();
  await page.locator('#confirmPlate').click();
  await page.locator('[data-view="top"]').click();
  await expect(page.locator('[data-handle-kind="edge"]')).toHaveCount(4);
  await dragHandle(page, 'part-2:edge:+x', 40, 0);
  await expect(page.locator('#changeBox')).toHaveAttribute('data-kind', 'width');
  await page.locator('#changeValue').fill('400');
  await page.keyboard.press('Enter');
  await expect(page.locator('#changeBox')).toBeHidden();
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'add-plate', widthMm: 400, depthMm: 300, acrossMm: 0 });

  // With Shift the far edge stays: the center moves half as far as the dragged edge.
  await dragHandle(page, 'part-2:edge:+x', 40, 0, 'Shift');
  await expect(page.locator('#changeBox')).toHaveAttribute('data-kind', 'change');
  await page.locator('#changeValue').fill('100');
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ widthMm: 500, acrossMm: 50 });
});

test('dragging the free end of a profile to the face in front of it makes it a span', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('#part-startX').fill('800');
  await page.locator('#part-startX').press('Enter');
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#growProfile').click();
  await page.locator('#grow-face').selectOption('+x');
  await page.locator('#confirmGrowth').click();
  await page.locator('[data-view="top"]').click();
  // The growth is 500 mm long out of the rail's face at x = 20; the other rail's face is at 780.

  // In the top view +X is towards the right of the screen: the end goes towards the other rail
  // a few pixels at a time, until it reaches its face.
  const ball = await page.locator('[data-handle="part-3:end"]').boundingBox();
  if (!ball) throw new Error('No end handle on the growth');
  const x = ball.x + ball.width / 2;
  const y = ball.y + ball.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const box = page.locator('#changeBox');
  for (let dx = 4; dx < 600; dx += 4) {
    await page.mouse.move(x + dx, y);
    if ((await box.getAttribute('data-kind')) === 'reach') break;
  }
  await page.mouse.up();
  await expect(box).toHaveAttribute('data-kind', 'reach');
  await expect(page.locator('#changeValue')).toBeHidden();

  await page.locator('#confirmChange').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ reachesId: 'part-2', lengthMm: 760 });
});

test('dragging a waiting change again carries on from where it was let go', async ({ page }) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  const ball = page.locator('[data-handle="part-1:end"]');
  const startY = (await ball.boundingBox())?.y ?? 0;
  await dragHandle(page, 'part-1:end', 0, 60);
  const first = Number(await page.locator('#changeValue').inputValue());
  const firstY = (await ball.boundingBox())?.y ?? 0;
  await dragHandle(page, 'part-1:end', 0, 60);
  const second = Number(await page.locator('#changeValue').inputValue());
  // Both drags cover the same pixels, so the second adds about as much as the first.
  expect(Math.abs(second - 2 * first)).toBeLessThan(first / 4);
  await expect(page.locator('#changeBox')).toBeVisible();
  // The ball goes on from where it was let go: the second drag moves it about as far.
  const secondY = (await ball.boundingBox())?.y ?? 0;
  expect(Math.abs(secondY - firstY - (firstY - startY))).toBeLessThan(10);
});

test('a profile about to grow is dragged by its handles, measured, and added as it snapped', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('#part-startX').fill('800');
  await page.locator('#part-startX').press('Enter');
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#growProfile').click();
  await page.locator('#grow-face').selectOption('+x');
  await page.locator('[data-view="top"]').click();
  // The rail is 500 mm long, and the new profile starts at its middle.
  const fromStart = page.locator('#sceneLabels [data-measures="placement-start"]');
  await expect(fromStart).toHaveText('250 mm');
  await expect(page.locator('#sceneLabels [data-measures="placement-end"]')).toHaveText('250 mm');
  const length = page.locator('#sceneLabels [data-measures="part-length"]');
  await expect(length).toHaveText('500 mm');

  // In the top view +X is towards the right of the screen: the free end goes towards the other
  // rail a few pixels at a time, until it reaches its face.
  const ball = await page.locator('[data-handle="part-3:end"]').boundingBox();
  if (!ball) throw new Error('No end handle on the profile about to grow');
  const x = ball.x + ball.width / 2;
  const y = ball.y + ball.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const reaching = page.locator('#grow-reachesId');
  for (let dx = 4; dx < 600; dx += 4) {
    await page.mouse.move(x + dx, y);
    if ((await reaching.inputValue()) === 'part-2') break;
  }
  await page.mouse.up();
  await expect(reaching).toHaveValue('part-2');
  await expect(page.locator('#changeBox')).toBeHidden();
  await expect(page.locator('#grow-lengthMm')).toHaveValue('760');
  await expect(length).toHaveText('760 mm');

  await page.locator('#confirmGrowth').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ reachesId: 'part-2', lengthMm: 760, alongMm: 250 });
});

test('a bracket of a crossing goes beside either profile from the card in the view', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.keyboard.press('r');
  await page.locator('#confirmGrowth').click();
  await page.locator('[data-joint-marker="part-2@part-1"]').click();
  const card = page.locator('#jointCard');
  await expect(card.locator('[data-side]')).toHaveCount(3);
  await card.locator('[data-side="+x"]').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'fasten-joint', connectors: [{ side: '+x' }] });
  await expect(card.locator('[data-side="+x"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a joint without connectors is marked in the view, and its card fastens it', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#growProfile').click();
  await page.locator('#confirmGrowth').click();
  const marker = page.locator('[data-joint-marker="part-2@part-1"]');
  await expect(marker).toHaveAttribute('data-state', 'pending');

  await marker.click();
  const card = page.locator('#jointCard');
  await expect(card).toBeVisible();
  await card.locator('[data-joint-brackets]').click();
  await expect
    .poll(async () =>
      (await savedHistory(page))?.map((operation: { kind: string }) => operation.kind),
    )
    .toEqual(['add-anchored-profile', 'grow-profile', 'fasten-joint']);
  // The new profile is still selected, so its fastened joint keeps a marker.
  await expect(marker).toHaveAttribute('data-state', 'fastened');
  await expect(card).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await marker.click();
  await clickViewport(page, 0.05, 0.05);
  await expect(card).toBeHidden();
  // A click that closes the card selects nothing: the profile stays selected.
  await expect(page.locator('[data-part="part-2"]')).toHaveAttribute('aria-pressed', 'true');
});

test('two parts that only touch are marked, and their card joins them', async ({ page }) => {
  await startDesign(page);
  await page.locator('#addProfile').click();
  await page.locator('#part-startX').fill('40');
  await page.locator('#part-startX').press('Enter');
  const touching = page.locator('[data-joint-marker][data-state="touching"]');
  await expect(touching).toHaveCount(1);

  await touching.click();
  const card = page.locator('#jointCard');
  await card.locator('[data-join]').click();
  await expect.poll(async () => (await savedHistory(page))?.at(-1)?.kind).toBe('join-parts');
  await expect(touching).toHaveCount(0);
  await expect(page.locator('[data-joint-marker][data-state="pending"]')).toHaveCount(1);
  // The card stays open on the joint the two parts now have.
  await expect(card.locator('[data-joint-row]')).toBeVisible();

  await card.locator('[data-joint-more]').click();
  await expect(card).toBeHidden();
  await expect(page.locator('#partJoints')).toBeVisible();
});

/** Turns Fit on and mounts pedals on the selected part, as previewed. */
async function mountPedals(page: Page) {
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountPedals').click();
  await expect(page.locator('#peripheralPanel')).toBeVisible();
  await page.locator('#confirmPeripheral').click();
  await expect(page.locator('#peripheralPanel')).toBeHidden();
}

test('Fit locks the frame and mounts a peripheral on it, previewed until it is mounted', async ({
  page,
}) => {
  await startDesign(page);
  await expect(page.locator('#fitModeBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#fitModeBtn').click();
  await expect(page.locator('#fitModeBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#lockedPart')).toBeVisible();
  await expect(page.locator('#growProfile')).toBeHidden();
  await expect(page.locator('#removePart')).toBeHidden();
  await expect(page.locator('#addProfile')).toBeDisabled();
  await page.locator('#mountPedals').click();
  await expect(page.locator('#peripheralPanel')).toBeVisible();
  await expect(page.locator('#peripheral-face')).toHaveValue('+y');
  await expect(page.locator('#peripheral-facing')).toHaveValue('+z');
  await page.locator('#confirmPeripheral').click();
  await expect(page.locator('[data-part="part-2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#part-facing')).toHaveValue('+z');
  await expect(page.locator('#deletePeripheral')).toBeVisible();
  await expect(page.locator('#removePart')).toBeHidden();
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({
      kind: 'mount-peripheral',
      typeId: 'generic-pedals',
      category: 'pedals',
      parentId: 'part-1',
      face: '+y',
      facing: '+z',
    });
  // A peripheral's step goes from the whole history, as if it had never been mounted.
  await page.locator('#deletePeripheral').click();
  await expect.poll(async () => (await savedHistory(page))?.length).toBe(1);
  await expect(page.locator('[data-part="part-2"]')).toHaveCount(0);
});

test('out of Fit a peripheral is a reference that clicks go through; its step turns Fit on', async ({
  page,
}) => {
  await startDesign(page);
  await mountPedals(page);
  await page.locator('#fitModeBtn').click();
  await expect(page.locator('#fitModeBtn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#noPartSelected')).toBeVisible();
  await page.locator('[data-view="top"]').click();
  await clickViewport(page, 0.5, 0.5);
  await expect(page.locator('#part-name')).toHaveValue('40 × 40 profile 1');
  await expect(page.locator('#growProfile')).toBeVisible();
  await page.locator('[data-part="part-2"]').click();
  await expect(page.locator('#fitModeBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#part-facing')).toBeVisible();
  await clickViewport(page, 0.5, 0.5);
  // Picked in the view, the pedals stay selected, no longer marked in the history.
  await expect(page.locator('#showInHistory')).toBeVisible();
  await expect(page.locator('#part-typeId')).toHaveValue('generic-pedals');
});

test("a peripheral's inspector edits its own values, and swapping its type warns when they were edited", async ({
  page,
}) => {
  await startDesign(page);
  await mountPedals(page);
  const peripheral = async () => (await savedHistory(page))?.[1];
  await expect(page.locator('#part-typeId')).toHaveValue('generic-pedals');

  await page.locator('#part-widthMm').fill('420');
  await page.locator('#part-widthMm').press('Enter');
  await expect.poll(async () => (await peripheral())?.envelope).toMatchObject({ widthMm: 420 });
  await page.locator('#addHole').click();
  await expect.poll(async () => (await peripheral())?.mountingPattern.holes.length).toBe(5);
  await page.locator('[data-remove-hole="4"]').click();
  await expect.poll(async () => (await peripheral())?.mountingPattern.holes.length).toBe(4);
  await page.locator('#part-holeDiameterMm-0').fill('10');
  await page.locator('#part-holeDiameterMm-0').press('Enter');
  await expect
    .poll(async () => (await peripheral())?.mountingPattern.holes[0])
    .toMatchObject({ diameterMm: 10 });
  await page.locator('#part-contactYMm-heel').fill('40');
  await page.locator('#part-contactYMm-heel').press('Enter');
  await expect
    .poll(async () => (await peripheral())?.contactPoints[0].offsetMm)
    .toMatchObject({ y: 40 });

  const dialog = page.locator('#swapPeripheralDialog');
  await page.locator('#part-typeId').selectOption('generic-seat');
  await expect(dialog).toBeVisible();
  await dialog.locator('.dialog-actions [data-close]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#part-typeId')).toHaveValue('generic-pedals');
  expect((await peripheral())?.typeId).toBe('generic-pedals');

  await page.locator('#part-typeId').selectOption('generic-seat');
  await page.locator('#confirmSwapPeripheral').click();
  await expect
    .poll(peripheral)
    .toMatchObject({ typeId: 'generic-seat', category: 'seat', name: 'Bucket seat' });
  await expect(page.locator('#part-backrestDeg')).toBeVisible();
  await expect(page.locator('#part-widthMm')).toHaveValue('540');
});

test('a peripheral for one hand is mounted from the toolbar and says which hand holds its grip', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountThrottle').click();
  await expect(page.locator('#peripheralPanel')).toBeVisible();
  await page.locator('#confirmPeripheral').click();
  await expect(page.locator('#peripheralPanel')).toBeHidden();
  const peripheral = async () => (await savedHistory(page))?.[1];
  await expect
    .poll(peripheral)
    .toMatchObject({ typeId: 'generic-throttle', category: 'throttle', hand: 'left' });
  await expect(page.locator('#part-hand')).toHaveValue('left');

  await page.locator('#part-hand').selectOption('right');
  await expect.poll(async () => (await peripheral())?.hand).toBe('right');
  await page.locator('#part-typeId').selectOption('generic-side-stick');
  await expect.poll(peripheral).toMatchObject({ category: 'side-stick', hand: 'right' });
  await page.locator('#part-typeId').selectOption('generic-pedals');
  await expect.poll(async () => (await peripheral())?.category).toBe('pedals');
  await expect(page.locator('#part-hand')).toBeHidden();
});

test('a seat rests the holes of one side on its profile, chosen in its inspector', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountSeat').click();
  await page.locator('#confirmPeripheral').click();
  const seat = async () => (await savedHistory(page))?.[1];
  await expect(page.locator('#part-holesOver')).toHaveValue('origin');
  await page.locator('#part-holesOver').selectOption('left');
  await expect.poll(seat).toMatchObject({ holesOver: 'left', acrossMm: 0 });
  await page.locator('#part-holesOver').selectOption('origin');
  await expect.poll(async () => (await seat())?.holesOver).toBeUndefined();
});

test('a seat goes between its rail and the nearest other, with how its holes fit the slots', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('#startWithCockpit').click();
  // 380 mm apart, the rails are 20 mm wider than the seat's holes.
  await page.locator('#importCockpitFile').setInputFiles(cockpitFileOf(seatRails(380)));
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountSeat').click();
  await expect(page.locator('#peripheral-betweenId')).toHaveValue('part-2');
  await expect(page.locator('[data-fit-check="between"]')).toBeVisible();
  await expect(page.locator('[data-fit-check="holes"].warning')).toHaveCount(4);
  await expect(page.locator('#peripheral-holesOver')).toHaveCount(0);

  await page.locator('#peripheral-betweenId').selectOption('alone');
  await expect(page.locator('#peripheral-holesOver')).toBeVisible();
  await expect(page.locator('[data-fit-check="between"]')).toHaveCount(0);
  await page.locator('#peripheral-betweenId').selectOption('part-2');
  await page.locator('#confirmPeripheral').click();

  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'mount-peripheral', parentId: 'part-1', betweenId: 'part-2' });
  await expect(page.locator('#part-betweenId')).toHaveValue('part-2');
  await page.locator('#part-betweenId').selectOption('alone');
  await expect.poll(async () => (await savedHistory(page))?.[2]?.betweenId).toBeUndefined();
});

/**
 * Four rails 1000 mm long along Z: Seat rail (part-1) at X 0, Near rail (part-2) 300 mm to its
 * right, Far rail (part-3) 400 mm to its left and a Decoy (part-4) beyond it, which puts Far rail
 * in the middle of the top view.
 */
function railsAcross(): Operation[] {
  const rails: [string, number][] = [
    ['Seat rail', 0],
    ['Near rail', -300],
    ['Far rail', 400],
    ['Decoy', 1100],
  ];
  let history = anchoredProfiles(rails.length);
  rails.forEach(([name, xMm], index) => {
    history = editProfile(history, `part-${index + 1}`, {
      name,
      lengthMm: 1000,
      startMm: { x: xMm, y: 20, z: 0 },
    });
  });
  return history;
}

test('a click on another rail in the view makes it the second rail of the seat about to be mounted', async ({
  page,
}) => {
  await openApp(page);
  await page.locator('#startWithCockpit').click();
  await page.locator('#importCockpitFile').setInputFiles(cockpitFileOf(railsAcross()));
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#fitModeBtn').click();
  await page.locator('[data-view="top"]').click();
  await page.locator('#mountSeat').click();
  await expect(page.locator('#peripheral-betweenId')).toHaveValue('part-2');

  await hoverViewport(page, 0.5, 0.5);
  await expect(page.locator('#hoverLabel')).toHaveAttribute('data-part', 'part-3');
  await clickViewport(page, 0.5, 0.5);
  await expect(page.locator('#peripheral-betweenId')).toHaveValue('part-3');
  await page.locator('#confirmPeripheral').click();
  await expect
    .poll(async () => (await savedHistory(page))?.[4])
    .toMatchObject({ kind: 'mount-peripheral', parentId: 'part-1', betweenId: 'part-3' });
});

test('fitting, a part slides along its adjustment, saved with the design without a step', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('[data-view="top"]').click();
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountSeat').click();
  await page.locator('#confirmPeripheral').click();
  const seat = async () => (await savedHistory(page))?.[1];
  await expect(page.locator('#adjustmentTravel')).toHaveValue('200');
  await expect(page.locator('#adjustmentAxis')).toHaveValue('z');
  // Fitting, a part that slides has only the arrow along its travel.
  await expect(page.locator('[data-handle]')).toHaveCount(1);
  await expect(page.locator('[data-handle-kind="travel"]')).toHaveCount(1);

  await page.locator('#adjustmentPosition').fill('-40');
  await page.locator('#adjustmentPosition').press('Enter');
  await expect.poll(async () => (await seat())?.adjustment).toMatchObject({ positionMm: -40 });
  expect(await savedHistory(page)).toHaveLength(2);

  // In the top view, the front (+Z) is towards the bottom of the screen.
  await dragHandle(page, 'part-2:travel', 0, 400);
  await expect(page.locator('#changeBox')).toHaveAttribute('data-kind', 'position');
  await expect(page.locator('#changeValue')).toHaveValue('100');
  await page.locator('#confirmChange').click();
  await expect.poll(async () => (await seat())?.adjustment).toMatchObject({ positionMm: 100 });
  expect(await savedHistory(page)).toHaveLength(2);
  await page.locator('#viewport canvas').focus();
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await seat())?.adjustment).toMatchObject({ positionMm: -40 });

  await page.locator('#removeAdjustment').click();
  await expect.poll(async () => (await seat())?.adjustment).toBeUndefined();
  await expect(page.locator('[data-handle-kind="move"]')).toHaveCount(2);
  await page.locator('#addAdjustment').click();
  await expect
    .poll(async () => (await seat())?.adjustment)
    .toEqual({ axis: 'z', travelMm: 100, positionMm: 0, runsOn: 'rails' });

  // The frame stays locked, but a part that hangs from another can slide.
  await page.locator('[data-part="part-1"]').click();
  await expect(page.locator('#lockedPart')).toBeVisible();
  await expect(page.locator('#addAdjustment')).toHaveCount(0);
});

test('each mode keeps where its parts are along their travels, and Fit needs a mode', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountSeat').click();
  await page.locator('#confirmPeripheral').click();
  await page.locator('#makeSubassembly').click();
  await page.locator('#addMode').click();
  await page.locator('#addMode').click();
  await expect(page.locator('#modeShown')).toHaveValue('mode-2');
  const saved = async () => (await getSavedProject(page))?.cockpit;

  await page.locator('#adjustmentPosition').fill('-40');
  await page.locator('#adjustmentPosition').press('Enter');
  await expect
    .poll(async () => (await saved())?.modes?.[1]?.positionsMm)
    .toEqual({ 'part-2': -40 });
  expect((await savedHistory(page))?.[1]).toMatchObject({ adjustment: { positionMm: 0 } });
  await page.locator('#modeShown').selectOption('mode-1');
  await expect(page.locator('#adjustmentPosition')).toHaveValue('0');
  await page.locator('#modeShown').selectOption('mode-2');
  await expect(page.locator('#adjustmentPosition')).toHaveValue('-40');

  // All the parts are not fitted: showing them turns Fit off, and Fit shows the first mode.
  await page.locator('#modeShown').selectOption('');
  await expect(page.locator('#fitModeBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#fitModeBtn').click();
  await expect(page.locator('#fitModeBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#modeShown')).toHaveValue('mode-1');
  await expect.poll(async () => (await saved())?.shownModeId).toBe('mode-1');
});

test('fitting, the checks list what a part would reach at an end of its travel', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#part-lengthMm').fill('2000');
  await page.locator('#part-lengthMm').press('Enter');
  await page.locator('#fitModeBtn').click();
  // Pedals near the front of the rail, then the seat at its middle, clear of them.
  await page.locator('#mountPedals').click();
  await page.locator('#peripheral-alongMm').fill('1700');
  await page.locator('#peripheral-alongMm').press('Enter');
  await page.locator('#confirmPeripheral').click();
  await page.locator('[data-part="part-1"]').click();
  await page.locator('#mountSeat').click();
  await page.locator('#confirmPeripheral').click();
  const travelCheck = page.locator('#cockpitChecks [data-check="cad-travel-interference"]');
  await expect(travelCheck).toHaveClass(/ok/);
  await expect(page.locator('#cockpitChecks [data-check="cad-interference"]')).toHaveClass(/ok/);

  await page.locator('#adjustmentTravel').fill('1000');
  await page.locator('#adjustmentTravel').press('Enter');
  await expect(travelCheck).toHaveClass(/warning/);
  await expect(travelCheck.locator('li')).toHaveCount(1);
  await expect(page.locator('#cockpitChecks [data-check="cad-interference"]')).toHaveClass(/ok/);
});

test('fitting with nothing selected, the panel seats the driver and sets the stature', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#part-lengthMm').fill('1500');
  await page.locator('#part-lengthMm').press('Enter');
  await page.locator('#fitModeBtn').click();
  await page.locator('#mountSeat').click();
  await page.locator('#peripheral-alongMm').fill('400');
  await page.locator('#peripheral-alongMm').press('Enter');
  await page.locator('#confirmPeripheral').click();
  await clickViewport(page, 0.03, 0.97);
  await expect(page.locator('#driverUnseated')).toBeVisible();

  await page.locator('[data-part="part-1"]').click();
  await page.locator('#mountPedals').click();
  await page.locator('#peripheral-alongMm').fill('1250');
  await page.locator('#peripheral-alongMm').press('Enter');
  await page.locator('#confirmPeripheral').click();
  await clickViewport(page, 0.03, 0.97);
  await expect(page.locator('#driverAngles [data-angle]')).toHaveCount(2);
  await expect(page.locator('#driverStature')).toHaveValue('175');
  const eye = await page.locator('#driverEye').textContent();

  await page.locator('#driverStature').fill('190');
  await page.locator('#driverStature').press('Enter');
  await expect
    .poll(async () => (await getSavedProject(page))?.cockpit?.driver)
    .toEqual({ statureMm: 1900 });
  await expect(page.locator('#driverEye')).not.toHaveText(eye ?? '');
  await page.locator('#viewport canvas').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('#driverStature')).toHaveValue('175');
});

test('without a wheel, the driver holds a stick and a throttle, one in each hand', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#part-lengthMm').fill('1500');
  await page.locator('#part-lengthMm').press('Enter');
  await page.locator('#fitModeBtn').click();
  const mount = async (button: string, alongMm: number) => {
    await page.locator('[data-part="part-1"]').click();
    await page.locator(button).click();
    await page.locator('#peripheral-alongMm').fill(String(alongMm));
    await page.locator('#peripheral-alongMm').press('Enter');
    await page.locator('#confirmPeripheral').click();
  };
  await mount('#mountSeat', 400);
  await mount('#mountPedals', 1250);
  await mount('#mountSideStick', 800);
  await mount('#mountThrottle', 900);
  await clickViewport(page, 0.03, 0.97);
  const elbows = page.locator('#driverAngles [data-angle="elbow"]');
  await expect(elbows).toHaveCount(2);
  await expect(page.locator('[data-angle="elbow"][data-hand="right"]')).toHaveCount(1);
  await expect(page.locator('[data-angle="elbow"][data-hand="left"]')).toHaveCount(1);
  await expect(page.locator('#driverGrips [data-grip]')).toHaveCount(2);

  await page.locator('[data-part="part-5"]').click();
  await page.locator('#part-hand').selectOption('right');
  await clickViewport(page, 0.03, 0.97);
  await expect(page.locator('[data-doubled="right"]')).toBeVisible();
  await expect(elbows).toHaveCount(0);
});

test('a part about to be added is added or dropped from its box in the view, or with Enter', async ({
  page,
}) => {
  await startDesign(page);
  await page.locator('#fitModeBtn').click();
  const box = page.locator('#draftBox');
  await expect(box).toBeHidden();

  await page.locator('#mountPedals').click();
  await expect(box).toBeVisible();
  await page.locator('#cancelDraftInView').click();
  await expect(box).toBeHidden();
  await expect(page.locator('#peripheralPanel')).toBeHidden();
  expect(await savedHistory(page)).toHaveLength(1);

  await page.locator('#mountPedals').click();
  await page.locator('#confirmDraftInView').click();
  await expect(box).toBeHidden();
  await expect
    .poll(async () => (await savedHistory(page))?.[1])
    .toMatchObject({ kind: 'mount-peripheral', typeId: 'generic-pedals' });

  await page.locator('[data-part="part-1"]').click();
  await page.locator('#mountSeat').click();
  await expect(box).toBeVisible();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await savedHistory(page))?.[2])
    .toMatchObject({ kind: 'mount-peripheral', typeId: 'generic-seat' });
});
