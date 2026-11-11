import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLayoutItem, draggedPosition } from '../src/layout-picking.ts';
import { defaults, evaluate, sanitize, transformPoint } from '../src/model.ts';

const setup = (changes = {}) => {
  const state = sanitize({ ...defaults, ...changes });
  return { state, evaluation: evaluate(state) };
};
const pick = ({ state, evaluation }, floor, options = {}) =>
  pickLayoutItem(floor, { ...floor, y: state.deskH }, state, evaluation, {
    layoutTarget: 'cockpit',
    roomEditing: false,
    ...options,
  });
const onDesk = ({ state, evaluation }, local) => transformPoint(local, evaluation.deskPose);

test('a desktop object is picked before the desk under it, in desk coordinates', () => {
  const world = setup({ keyboardEnabled: true });
  const { state } = world;
  const grab = pick(world, onDesk(world, { x: state.keyboardX, z: state.keyboardZ }));
  assert.equal(grab.target, 'keyboard');
  assert.equal(grab.desktop, true);
  assert.deepEqual([grab.x, grab.z], [state.keyboardX, state.keyboardZ]);
});

test('the taller object wins where two desktop objects overlap', () => {
  const world = setup({ keyboardEnabled: true, matEnabled: true });
  const { state } = world;
  const mat = world.evaluation.desktopItems.find((item) => item.id === 'mat');
  const local = { x: state.keyboardX - mat.local.x, z: state.keyboardZ - mat.local.z };
  assert.ok(Math.abs(local.x) < mat.sizeX / 2 && Math.abs(local.z) < mat.sizeZ / 2, 'on the mat');
  const grab = pick(world, onDesk(world, { x: state.keyboardX, z: state.keyboardZ }));
  assert.equal(grab.target, 'keyboard');
});

test('an empty spot on the desk picks the desk in world coordinates', () => {
  const world = setup({
    keyboardEnabled: false,
    mouseEnabled: false,
    pcEnabled: false,
    matEnabled: false,
  });
  const { state } = world;
  const corner = onDesk(world, { x: state.deskDepth / 2 - 2, z: -state.deskWidth / 2 + 2 });
  const grab = pick(world, corner);
  assert.equal(grab.target, 'desk');
  assert.equal(grab.desktop, false);
  assert.deepEqual([grab.x, grab.z], [state.deskX, state.deskZ]);
});

test('the cockpit is picked inside its footprint, and nothing far away', () => {
  const world = setup();
  const { evaluation } = world;
  const inside = transformPoint(
    {
      x: (evaluation.rigLeft + evaluation.rigRight) / 2,
      z: (evaluation.lowerZ + evaluation.upperZ) / 2,
    },
    evaluation.rigPose,
  );
  assert.equal(pick(world, inside).target, 'cockpit');
  assert.equal(pick(world, { x: 5000, z: 5000 }), null);
});

test('disabled items cannot be picked', () => {
  const world = setup({ cockpitEnabled: false });
  const { evaluation } = setup();
  const inside = transformPoint(
    {
      x: (evaluation.rigLeft + evaluation.rigRight) / 2,
      z: (evaluation.lowerZ + evaluation.upperZ) / 2,
    },
    evaluation.rigPose,
  );
  assert.notEqual(pick(world, inside)?.target, 'cockpit');
});

test('while editing the room, furniture and openings are picked by their outline', () => {
  const world = setup({
    roomEnabled: true,
    roomFurniture: [{ type: 'cabinet', id: 'box', x: 10, z: 20 }],
    roomFeatures: [{ type: 'window', id: 'win', wall: 'north', offset: 40, width: 80 }],
  });
  const furniture = pick(world, { x: 10, z: 20 }, { roomEditing: true });
  assert.deepEqual(
    [furniture.target, furniture.x, furniture.z, furniture.desktop],
    ['furniture:box', 10, 20, false],
  );
  const window = world.evaluation.room.features[0];
  const opening = pick(world, window.center, { roomEditing: true });
  assert.equal(opening.target, 'feature:win');
  assert.deepEqual([opening.x, opening.z], [window.center.x, window.center.z]);
});

test('outside room editing, room items are not picked', () => {
  const world = setup({
    roomEnabled: true,
    roomFurniture: [{ type: 'cabinet', id: 'box', x: 10, z: 20 }],
  });
  assert.notEqual(pick(world, { x: 10, z: 20 })?.target, 'furniture:box');
});

test('dragging moves the item by the pointer displacement, rounded to 0.1 cm', () => {
  const grab = { target: 'desk', start: { x: 10, z: 10 }, x: 100, z: 50, desktop: false };
  assert.deepEqual(draggedPosition(grab, { x: 22.345, z: 4.04 }), { x: 112.3, z: 44 });
});
