import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneBounds, viewHeight, cameraPose } from '../src/scene-camera.ts';
import { defaults, evaluate, sanitize } from '../src/model.ts';

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

test('the desk view frames the tabletop and the side view the rig height', () => {
  const framing = framingOf(defaults);
  assert.equal(
    viewHeight('desk', 1, framing),
    Math.max(defaults.deskDepth + 30, defaults.deskWidth + 40),
  );
  assert.ok(viewHeight('side', 1, framing) >= 205);
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
  for (const view of ['top', 'desk', 'side']) assert.equal(cameraPose(view, framing).rotate, false);
  const iso = cameraPose('iso', framing);
  assert.equal(iso.rotate, true);
  assert.deepEqual(iso.polar, [0.05, Math.PI / 2 - 0.02]);
});

test('the side view looks at the rig across its length, following its rotation', () => {
  const state = { ...defaults, cockpitAngle: 90 };
  const pose = cameraPose('side', framingOf(state));
  assert.equal(pose.target.y, 62);
  assert.ok(Math.abs(pose.position.x - pose.target.x) < 1e-9);
  assert.ok(Math.abs(pose.position.z - pose.target.z - 650) < 1e-9);
});

test('the desk view is centred on the desk and turns with it', () => {
  const state = { ...defaults, deskAngle: 90 };
  const pose = cameraPose('desk', framingOf(state));
  assert.equal(pose.target.x, state.deskX);
  assert.equal(pose.target.z, state.deskZ);
  assert.equal(pose.target.y, state.deskH);
  assert.ok(Math.abs(pose.up.z + 1) < 1e-9);
});
