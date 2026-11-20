import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAssembly,
  type FootPart,
  type Part,
  type ProfilePart,
  type Vec3Mm,
} from '../../src/cockpit/cad/parts/assembly.ts';
import type { Check } from '../../src/shared/checks.ts';
import {
  addAnchoredProfile,
  addOperation,
  deleteOperation,
  draftGrowth,
  editDraft,
  editProfile,
  replayDesign,
  type Operation,
} from '../../src/cockpit/cad/history/history.ts';
import { cadChecks } from '../../src/cockpit/checks.ts';
import { addAdjustment, editAdjustment } from '../../src/cockpit/cad/history/adjustments.ts';
import { editPlate } from '../../src/cockpit/cad/history/plates.ts';
import {
  growthTowardsRail,
  railHistory,
  withGrowth,
  withPeripheral,
  withPlate,
} from '../support/designs.ts';
import { present } from '../support/lookups.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const bar = (
  id: string,
  name: string,
  startMm: Vec3Mm,
  changes: Partial<ProfilePart> = {},
): ProfilePart => ({
  kind: 'profile',
  id,
  name,
  systemId: SYSTEM,
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 400,
  placement: { kind: 'anchor', startMm },
  ...changes,
});
const footUnder = (parentId: string): FootPart => ({
  kind: 'foot',
  id: `foot-${parentId}`,
  name: 'Foot',
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId, face: '-y', alongMm: 0, fromEnd: 'start' },
});
const byId = (checks: readonly Check[]) => Object.fromEntries(checks.map((c) => [c.id, c]));
/** The checks of a set of parts made by hand, with no history behind them. */
const checksFor = (parts: readonly Part[]) =>
  byId(cadChecks({ history: [], resolved: resolveAssembly(parts), failures: new Map() }));
/** The checks of a design history, replayed in full. */
const checksOfHistory = (history: readonly Operation[]) =>
  byId(cadChecks({ history, ...replayDesign(history) }));

/** A: a rail front to back. B grows up out of it. */
function ab() {
  const history = editProfile(addAnchoredProfile([]).history, 'part-1', { name: 'A' });
  return addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { name: 'B', lengthMm: 300 }),
  );
}

test('a sound design passes every check, with nothing to list', () => {
  const checks = checksFor([bar('a', 'Rail', { x: 0, y: 100, z: 0 }), footUnder('a')]);
  assert.deepEqual(
    Object.values(checks).map(({ id, level, value, items }) => ({ id, level, value, items })),
    [
      { id: 'cad-interference', level: 'ok', value: 'None', items: [] },
      { id: 'cad-support', level: 'ok', value: 'None', items: [] },
      { id: 'cad-pending-joints', level: 'ok', value: 'None', items: [] },
      { id: 'cad-failed-steps', level: 'ok', value: 'None', items: [] },
    ],
  );
});

test('interference within the cockpit is one warning listing each pair, in mm', () => {
  const parts = [
    bar('a', 'Seat post', { x: 0, y: 100, z: 0 }),
    bar('b', 'Seat crossmember', { x: -200, y: 130, z: 200 }, { axis: 'x' }),
    footUnder('a'),
    footUnder('b'),
  ];
  const check = checksFor(parts)['cad-interference'];
  assert.equal(check.level, 'warning');
  assert.equal(check.value, '1');
  assert.deepEqual(check.items, ['Seat post into Seat crossmember: 10 mm up or down']);
});

test('unsupported parts are one warning listing their names', () => {
  const parts = [
    bar('a', 'Rail', { x: 0, y: 100, z: 0 }),
    footUnder('a'),
    bar('b', 'Floating post', { x: 500, y: 400, z: 0 }),
  ];
  const check = checksFor(parts)['cad-support'];
  assert.equal(check.level, 'warning');
  assert.equal(check.value, '1');
  assert.deepEqual(check.items, ['Floating post']);
});

test('a design without feet says so, as nothing in it stands on the floor', () => {
  const check = checksFor([bar('a', 'Rail', { x: 0, y: 100, z: 0 })])['cad-support'];
  assert.deepEqual(check.items, ['Rail']);
  assert.match(check.detail, /no feet/);
});

test('joints without connectors are pending, named by their two parts', () => {
  const check = checksOfHistory(ab())['cad-pending-joints'];
  assert.equal(check.level, 'warning');
  assert.equal(check.value, '1');
  assert.deepEqual(check.items, ['B to A']);
});

test('failed steps are listed with their number, their part and why they fail', () => {
  const history = deleteOperation(
    editProfile(addAnchoredProfile(ab()).history, 'part-3', { name: 'C' }),
    'op-1',
  );
  const check = checksOfHistory(history)['cad-failed-steps'];
  assert.equal(check.level, 'warning');
  assert.equal(check.value, '1');
  assert.deepEqual(check.items, ['Step 1, B: It grows out of a part that was deleted.']);
});

test('interference is checked with each part where its adjustment puts it', () => {
  const history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'Rail',
    lengthMm: 1000,
  });
  const post = editDraft(history, draftGrowth(history, 'part-1'), { name: 'Post', lengthMm: 200 });
  let posted = addOperation(history, post);
  const other = editDraft(posted, draftGrowth(posted, 'part-1'), {
    name: 'Other post',
    alongMm: 560,
    lengthMm: 200,
  });
  posted = addAdjustment(addOperation(posted, other), 'part-2');
  assert.deepEqual(checksOfHistory(posted)['cad-interference'].items, []);
  const slid = editAdjustment(posted, 'part-2', { positionMm: 40 });
  assert.deepEqual(checksOfHistory(slid)['cad-interference'].items, [
    'Post into Other post: 20 mm front to back',
  ]);
});

test('a span that an adjustment would stretch or squeeze is listed once a part has one', () => {
  assert.equal(checksOfHistory(ab())['cad-fitted-spans'], undefined, 'no part slides');
  let history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'Rail',
    lengthMm: 1000,
  });
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    name: 'High rail',
    lengthMm: 1000,
    startMm: { x: 500, y: 140, z: 0 },
  });
  history = addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { name: 'Post', lengthMm: 200 }),
  );
  const crossing = editDraft(history, draftGrowth(history, 'part-3'), {
    name: 'Crossing',
    face: '+x',
    fromEnd: 'start',
    alongMm: 100,
  });
  history = editProfile(addOperation(history, crossing), 'part-4', { reachesId: 'part-2' });
  history = addAdjustment(history, 'part-3');
  assert.equal(checksOfHistory(history)['cad-fitted-spans'].level, 'ok');
  const slid = editAdjustment(history, 'part-3', { axis: 'x', travelMm: 40, positionMm: 10 });
  const check = checksOfHistory(slid)['cad-fitted-spans'];
  assert.equal(check.level, 'warning');
  assert.deepEqual(check.items, ['Crossing would have to be 10 mm shorter to meet High rail']);
});

test('parts that meet at an end of a travel are listed, saying which part is at which end', () => {
  assert.equal(checksOfHistory(ab())['cad-travel-interference'], undefined, 'no part slides');
  let history = withGrowth(railHistory(), 'part-1', { name: 'Post', lengthMm: 200 });
  history = withGrowth(history, 'part-1', { name: 'Other post', alongMm: 560, lengthMm: 200 });
  const check = checksOfHistory(addAdjustment(history, 'part-2'))['cad-travel-interference'];
  assert.equal(check.level, 'warning');
  assert.deepEqual(check.items, [
    'Post into Other post: 30 mm front to back, with Post at the front end of its travel',
  ]);
  const short = editAdjustment(addAdjustment(history, 'part-2'), 'part-2', { travelMm: 40 });
  assert.equal(checksOfHistory(short)['cad-travel-interference'].level, 'ok');
});

const PLATE_CHECKS = [
  'cad-holes-off-plate',
  'cad-holes-near-edge',
  'cad-holes-near-holes',
  'cad-uncut-slots',
  'cad-holes-over-profiles',
];

test('a design with a plate gets the five checks of its holes, none with nothing to list', () => {
  assert.equal(checksOfHistory(railHistory())['cad-holes-off-plate'], undefined, 'no plate');
  const checks = checksOfHistory(withPlate(railHistory(), 'part-1'));
  assert.deepEqual(
    PLATE_CHECKS.map((id) => [checks[id]?.level, checks[id]?.items]),
    PLATE_CHECKS.map(() => ['ok', []]),
  );
});

test('the problems of a plate’s holes are listed under its name, one check for each kind', () => {
  const plate = withPlate(railHistory(), 'part-1', { name: 'Wheel plate', widthMm: 200 });
  const holes = [
    { xMm: 97, yMm: 0, diameterMm: 8 },
    { xMm: 40, yMm: 0, diameterMm: 8 },
    { xMm: 45, yMm: 0, diameterMm: 8 },
    { xMm: 10, yMm: 0, diameterMm: 8 },
    { xMm: -90, yMm: 0, diameterMm: 8 },
  ];
  let history = withPeripheral(plate, 'part-2', 'generic-wheel-base', {
    name: 'Wheel base',
    mountingPattern: { holes },
  });
  history = editAdjustment(addAdjustment(history, 'part-3'), 'part-3', { runsOn: 'slots' });
  history = editPlate(history, 'part-2', { processId: 'hand-drilling' });
  const checks = checksOfHistory(history);
  assert.deepEqual(
    PLATE_CHECKS.map((id) => [id, checks[id]?.level, checks[id]?.items?.length]),
    [
      ['cad-holes-off-plate', 'warning', 1],
      ['cad-holes-near-edge', 'warning', 1],
      ['cad-holes-near-holes', 'warning', 1],
      ['cad-uncut-slots', 'warning', 5],
      ['cad-holes-over-profiles', 'warning', 1],
    ],
  );
  assert.deepEqual(checks['cad-holes-off-plate']?.items, [
    'Wheel plate: Wheel base, hole 1 crosses the edge',
  ]);
});

test('a design with subassemblies lists the spans outside one that reach into it', () => {
  // B (part-3) hangs from A (part-1) and spans to C (part-2).
  const history = editProfile(growthTowardsRail(), 'part-3', { reachesId: 'part-2' });
  const checksWith = (subassemblies: { name: string; rootId: string }[]) =>
    byId(cadChecks({ history, ...replayDesign(history), subassemblies }));

  assert.equal(checksWith([])['cad-subassembly-dependents'], undefined);
  assert.equal(
    checksWith([{ name: 'Frame', rootId: 'part-1' }])['cad-subassembly-dependents']?.level,
    'ok',
  );
  const found = present(
    checksWith([{ name: 'Side rail', rootId: 'part-2' }])['cad-subassembly-dependents'],
    'the check of parts depending on a subassembly',
  );
  assert.equal(found.level, 'warning');
  assert.deepEqual(found.items, ['B reaches C, in Side rail']);
});
