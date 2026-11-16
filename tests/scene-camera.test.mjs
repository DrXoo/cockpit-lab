import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sceneBounds,
  viewHeight,
  cameraPose,
  designBounds,
  floorHeightCm,
} from '../src/scene-camera.ts';
import { defaults, evaluate, sanitize } from '../src/model.ts';
import { NOTHING_AROUND } from '../src/cockpit-editor-view.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';

const framingOf = (state) => {
  const evaluation = evaluate(state);
  return { state, evaluation, bounds: sceneBounds(state, evaluation) };
};

const withChair = sanitize({
  ...defaults,
  roomEnabled: true,
  roomFurniture: [{ type: 'chair', id: 'far', x: defaults.roomX + 5, z: defaults.roomZ + 5 }],
});

test('the drawn area covers the setup and, when the room is shown, the room itself', () => {
  const state = { ...withChair, roomEnabled: true };
  const evaluation = evaluate(state);
  const bounds = sceneBounds(state, evaluation);
  assert.ok(bounds.left <= evaluation.allLeft && bounds.left <= evaluation.roomBounds.left);
  assert.ok(bounds.front >= evaluation.allFront && bounds.front >= evaluation.roomBounds.front);
  const hidden = { ...state, roomEnabled: false };
  const setupOnly = sceneBounds(hidden, evaluate(hidden));
  const e = evaluate(hidden);
  assert.deepEqual(setupOnly, {
    left: e.allLeft,
    right: e.allRight,
    back: e.allBack,
    front: e.allFront,
  });
});

test('the top view shows the whole drawn area with a margin on both axes', () => {
  const framing = framingOf(defaults);
  const { left, right, back, front } = framing.bounds;
  const wide = viewHeight('top', 3, framing);
  const tall = viewHeight('top', 0.5, framing);
  assert.equal(wide, Math.max(front - back + 60, (right - left + 60) / 3));
  assert.ok(tall * 0.5 >= right - left + 60, 'the width still fits a portrait screen');
});

test('the desk view frames the tabletop', () => {
  const framing = framingOf(defaults);
  assert.equal(
    viewHeight('desk', 1, framing),
    Math.max(defaults.deskDepth + 30, defaults.deskWidth + 40),
  );
});

test('before the first update the view uses fallback sizes', () => {
  assert.equal(viewHeight('top', 1, null), 340);
  assert.ok(viewHeight('iso', 1, null) >= 245);
});

test('the top view looks straight down with the back of the room at the top', () => {
  const framing = framingOf(defaults);
  const pose = cameraPose('top', framing);
  const { left, right, back, front } = framing.bounds;
  assert.deepEqual(pose.target, { x: (left + right) / 2, y: 0, z: (back + front) / 2 });
  assert.equal(pose.position.y, 650);
  assert.deepEqual(pose.up, { x: 0, y: 0, z: -1 });
  assert.equal(pose.rotate, false);
});

test('only the 3D view can be orbited', () => {
  const framing = framingOf(defaults);
  for (const view of ['top', 'desk']) assert.equal(cameraPose(view, framing).rotate, false);
  const iso = cameraPose('iso', framing);
  assert.equal(iso.rotate, true);
  assert.deepEqual(iso.polar, [0.05, Math.PI / 2 - 0.02]);
});

test('the desk view is centred on the desk and turns with it', () => {
  const state = { ...defaults, deskAngle: 90 };
  const pose = cameraPose('desk', framingOf(state));
  assert.equal(pose.target.x, state.deskX);
  assert.equal(pose.target.z, state.deskZ);
  assert.equal(pose.target.y, state.deskH);
  assert.ok(Math.abs(pose.up.z + 1) < 1e-9);
});

const rail = (id, startMm, lengthMm = 1000) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: 'motedis-40-i-slot-8',
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm,
  placement: { kind: 'anchor', startMm },
});
const designFraming = (parts) => {
  const evaluation = evaluate(NOTHING_AROUND);
  return {
    state: NOTHING_AROUND,
    evaluation,
    bounds: designBounds(resolveAssembly(parts)),
  };
};

test('a design on its own is framed by its parts, in cm, from the floor to its top', () => {
  const bounds = designBounds(
    resolveAssembly([
      rail('low', { x: -200, y: 20, z: 0 }),
      rail('high', { x: 300, y: 580, z: 100 }),
    ]),
  );
  assert.deepEqual(bounds, {
    left: -22,
    right: 32,
    back: 0,
    front: 110,
    vertical: { bottom: 0, top: 60 },
  });
});

test('a design on its own stands on its lowest part, such as its feet', () => {
  const raised = designBounds(resolveAssembly([rail('rail', { x: 0, y: 80, z: 0 })]));
  assert.equal(floorHeightCm(raised), 6);
  const below = designBounds(resolveAssembly([rail('rail', { x: 0, y: -40, z: 0 })]));
  assert.equal(floorHeightCm(below), -6);
});

test('a room keeps its floor at zero', () => {
  assert.equal(floorHeightCm({ left: 0, right: 100, back: 0, front: 100 }), 0);
});

test("the side view looks at the design from the driver's right, with the front to the right", () => {
  const framing = designFraming([rail('rail', { x: 0, y: 20, z: 0 })]);
  const pose = cameraPose('side', framing);
  assert.equal(pose.rotate, false);
  assert.deepEqual(pose.up, { x: 0, y: 1, z: 0 });
  assert.ok(pose.position.x < pose.target.x, 'the camera stands on the -X side');
  assert.equal(pose.position.z, pose.target.z);
  assert.equal(pose.target.z, 50);
  assert.equal(pose.target.y, 2);
});

test('the side view fits the height and the length of the design with a margin', () => {
  const framing = designFraming([rail('rail', { x: 0, y: 20, z: 0 }, 2000)]);
  assert.ok(viewHeight('side', 1, framing) >= 200);
  assert.ok(viewHeight('side', 0.5, framing) * 0.5 >= 200, 'the length fits a portrait screen');
});

test('the 3D view looks at the middle of the height of a design on its own', () => {
  const framing = designFraming([rail('rail', { x: 0, y: 380, z: 0 })]);
  const pose = cameraPose('iso', framing);
  assert.deepEqual(pose.target, { x: 0, y: 38, z: 50 });
});
