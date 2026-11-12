import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { drawRoom } from '../src/render-room.ts';
import { defaults, evaluate, sanitize } from '../src/model.ts';

const DIMS = 99;
const FLOOR = '#123456';
const draw = (changes = {}) => {
  // Without a cockpit or a desk, only the room's own items can block each other.
  const state = sanitize({
    ...defaults,
    roomEnabled: true,
    cockpitEnabled: false,
    deskEnabled: false,
    ...changes,
  });
  const evaluation = evaluate(state);
  const r = createRenderList();
  drawRoom(r, ROOT, DIMS, state, evaluation, FLOOR);
  return { state, evaluation, r };
};
const flatColor = (r, ref) =>
  r.primitives.find((p) => p.kind === 'material' && p.id === ref)?.spec.color;
const labelText = (r) => r.labels.map((l) => l.text);

test('the room floor takes the color of the theme', () => {
  const { r } = draw();
  const floor = r.primitives.find((p) => p.kind === 'plane');
  assert.equal(flatColor(r, floor.material), FLOOR);
});

test('without a room nothing is drawn', () => {
  const { r } = draw({ roomEnabled: false });
  assert.deepEqual(r.primitives, []);
  assert.deepEqual(r.labels, []);
});

test('walls are low outlines unless full walls are asked for', () => {
  const wallHeights = (r) =>
    r.primitives.filter((p) => p.kind === 'box' && p.parent === ROOT).map((p) => p.size[1]);
  const low = draw({ roomFullWalls: false });
  assert.ok(wallHeights(low.r).every((h) => h === 14));
  const full = draw({ roomFullWalls: true });
  assert.ok(wallHeights(full.r).every((h) => h === full.state.roomH));
});

test('a window leaves the wall open between its sill and its top', () => {
  const { state, r } = draw({
    roomFullWalls: true,
    roomFeatures: [{ type: 'window', wall: 'north', offset: 50, width: 80, sill: 90, height: 100 }],
  });
  const wall = r.primitives[0].id;
  const parts = r.primitives.filter((p) => p.kind === 'box' && p.material === wall);
  const spans = parts.map((p) => [p.position[1] - p.size[1] / 2, p.position[1] + p.size[1] / 2]);
  assert.deepEqual(spans.slice(0, 4), [
    [0, state.roomH],
    [0, 90],
    [190, state.roomH],
    [0, state.roomH],
  ]);
});

test('a blocked door is drawn in red and says so', () => {
  const door = { type: 'door', id: 'door', wall: 'south', offset: 60, width: 80, openAngle: 90 };
  const free = draw({ roomFeatures: [door] });
  assert.equal(free.evaluation.room.doorHits.length, 0);
  assert.ok(labelText(free.r).some((text) => text.endsWith('· 90°')));
  const arc = (r) => r.primitives.find((p) => p.kind === 'line' && typeof p.material === 'number');
  assert.equal(flatColor(free.r, arc(free.r).material), '#cc8850');
  const { center, frame } = free.evaluation.room.features[0];
  const inSweep = { x: center.x + frame.nx * 40, z: center.z + frame.nz * 40 };
  const blocked = draw({
    roomFeatures: [door],
    roomFurniture: [{ type: 'cabinet', id: 'box', width: 30, depth: 30, ...inSweep }],
  });
  assert.deepEqual(blocked.evaluation.room.doorHits, ['door']);
  assert.ok(labelText(blocked.r).some((text) => text.endsWith('· 90° · BLOCKED')));
  assert.equal(flatColor(blocked.r, arc(blocked.r).material), '#b94f35');
});

test('a wardrobe front states whether its access is kept free', () => {
  const access = (clearance) =>
    labelText(draw({ roomFeatures: [{ type: 'wardrobeAccess', wall: 'east', clearance }] }).r).find(
      (text) => text.includes('⇆'),
    );
  assert.match(access(0), /! CLEARANCE OFF$/);
  assert.match(access(60), /✓ ACCESS CLEAR · 60 cm in front$/);
});

test('furniture that interferes is flagged with a symbol as well as a colour', () => {
  const { state, evaluation, r } = draw({
    roomFurniture: [
      { type: 'cabinet', id: 'a', x: defaults.roomX + 100, z: defaults.roomZ + 100 },
      { type: 'cabinet', id: 'b', x: defaults.roomX + 100, z: defaults.roomZ + 100 },
    ],
  });
  assert.ok(evaluation.room.collisions.length > 0, state.roomW);
  assert.ok(labelText(r).some((text) => text.endsWith('· ! INTERFERENCE')));
});

test('the room size is measured on the plan, in the dimensions group', () => {
  const { state, r } = draw();
  const sizes = r.labels.filter((l) => l.text.includes(`${state.roomW} cm`));
  assert.equal(sizes.length, 1);
  assert.equal(sizes[0].topOnly, true);
  assert.ok(r.primitives.some((p) => p.kind === 'line' && p.parent === DIMS));
});

test('the corners are named A to D for the wall editor', () => {
  const { r } = draw();
  assert.deepEqual(
    r.labels.filter((l) => l.text.length === 1).map((l) => l.text),
    ['A', 'B', 'C', 'D'],
  );
});
