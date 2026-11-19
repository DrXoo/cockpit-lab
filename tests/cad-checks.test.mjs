import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import {
  addAnchoredProfile,
  addOperation,
  deleteOperation,
  draftGrowth,
  editDraft,
  editProfile,
  replayDesign,
} from '../src/cad/history.ts';
import { cadChecks } from '../src/cad-checks.ts';
import { addAdjustment, editAdjustment } from '../src/cad/adjustments.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const bar = (id, name, startMm, changes = {}) => ({
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
const footUnder = (parentId) => ({
  kind: 'foot',
  id: `foot-${parentId}`,
  name: 'Foot',
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId, face: '-y', alongMm: 0, fromEnd: 'start' },
});
const byId = (checks) => Object.fromEntries(checks.map((c) => [c.id, c]));
/** The checks of a set of parts made by hand, with no history behind them. */
const checksFor = (parts) =>
  byId(cadChecks({ history: [], resolved: resolveAssembly(parts), failures: new Map() }));
/** The checks of a design history, replayed in full. */
const checksOfHistory = (history) => byId(cadChecks({ history, ...replayDesign(history) }));

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
