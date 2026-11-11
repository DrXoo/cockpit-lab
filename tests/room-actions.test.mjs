import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRoomItem,
  canAddRoomItem,
  stepOfRoomItem,
  updateRoomItem,
  deleteRoomItem,
  placeChairAtDesk,
  centerInRoom,
} from '../src/room-actions.ts';
import { defaults, sanitize, evaluate } from '../src/model.ts';
import { officeChairPlacement } from '../src/room.ts';

const room = sanitize({
  ...defaults,
  roomX: 0,
  roomZ: 0,
  roomW: 300,
  roomD: 400,
  roomEnabled: false,
});

test('adding a door enables the room and selects the new, validated door', () => {
  const { state, target } = addRoomItem(room, 'door', 'd1');
  assert.equal(state.roomEnabled, true);
  assert.equal(target, 'feature:d1');
  assert.deepEqual(state.roomFeatures, [
    {
      id: 'd1',
      type: 'door',
      name: 'Puerta',
      wall: 'south',
      width: 80,
      height: 205,
      sill: 0,
      offset: 20,
      hinge: 'start',
      swing: 'in',
      openAngle: 90,
      clearance: 60,
    },
  ]);
});

test('a built-in wardrobe front starts centred on the north wall', () => {
  const access = addRoomItem(room, 'wardrobeAccess', 'w1').state.roomFeatures[0];
  assert.equal(access.wall, 'north');
  assert.equal(access.width, 180);
  assert.equal(access.offset, 60);
});

test('new furniture starts in the middle of the room with its own size', () => {
  const { state, target } = addRoomItem(room, 'bed', 'b1');
  assert.equal(target, 'furniture:b1');
  assert.deepEqual(
    (({ x, z, width, depth, height }) => ({ x, z, width, depth, height }))(state.roomFurniture[0]),
    { x: 150, z: 200, width: 140, depth: 200, height: 60 },
  );
});

test('a new office chair faces the desk, or the room centre without a desk', () => {
  const chair = addRoomItem(room, 'chair', 'c1').state.roomFurniture[0];
  const expected = officeChairPlacement(room, chair);
  assert.deepEqual({ x: chair.x, z: chair.z, angle: chair.angle }, expected);
  const alone = addRoomItem({ ...room, deskEnabled: false }, 'chair', 'c1').state.roomFurniture[0];
  assert.deepEqual({ x: alone.x, z: alone.z, angle: alone.angle }, { x: 150, z: 200, angle: 0 });
});

test('the number of openings and furniture is limited', () => {
  const doors = Array.from({ length: 24 }, (_, i) => ({ id: `d${i}`, type: 'door' }));
  const full = sanitize({ ...room, roomFeatures: doors });
  assert.equal(canAddRoomItem(full, 'window'), false);
  assert.equal(canAddRoomItem(full, 'bed'), true);
});

test('doors and windows belong to the openings step, everything else to furniture', () => {
  assert.equal(stepOfRoomItem('door'), 'openings');
  assert.equal(stepOfRoomItem('window'), 'openings');
  assert.equal(stepOfRoomItem('wardrobeAccess'), 'furniture');
  assert.equal(stepOfRoomItem('shelf'), 'furniture');
});

test('editing a value positions items from the room walls', () => {
  const offsetRoom = { ...room, roomX: -50, roomZ: 10 };
  const { state, target } = addRoomItem(offsetRoom, 'bed', 'b1');
  const moved = updateRoomItem(state, target, 'x', 120);
  assert.equal(moved.roomFurniture[0].x, 70);
  const desk = updateRoomItem(state, 'desk', 'z', 40);
  assert.equal(desk.deskZ, 50);
  const turned = updateRoomItem(state, 'cockpit', 'angle', 90);
  assert.equal(turned.cockpitAngle, 90);
});

test('an edited opening is validated again', () => {
  const { state, target } = addRoomItem(room, 'window', 'w1');
  assert.equal(updateRoomItem(state, target, 'width', 9999).roomFeatures[0].width, 300);
});

test('deleting removes only the selected item', () => {
  let { state } = addRoomItem(room, 'bed', 'b1');
  state = addRoomItem(state, 'door', 'd1').state;
  const after = deleteRoomItem(state, 'furniture:b1');
  assert.deepEqual(after.roomFurniture, []);
  assert.equal(after.roomFeatures.length, 1);
  assert.equal(deleteRoomItem(state, 'desk'), state);
});

test('a chair can be moved back in front of the desk', () => {
  const { state, target } = addRoomItem(room, 'chair', 'c1');
  const away = updateRoomItem(state, target, 'x', 10);
  const back = placeChairAtDesk(away, target).roomFurniture[0];
  assert.deepEqual({ x: back.x, z: back.z, angle: back.angle }, officeChairPlacement(away, back));
});

test('centring moves desk and cockpit together to the middle of the room', () => {
  const state = { ...room, roomEnabled: true };
  const centred = centerInRoom(state, evaluate(state));
  const e = evaluate(centred);
  assert.ok(Math.abs((e.allLeft + e.allRight) / 2 - 150) <= 0.1);
  assert.ok(Math.abs((e.allBack + e.allFront) / 2 - 200) <= 0.1);
  assert.equal(
    centred.deskX - centred.cockpitX,
    Math.round((state.deskX - state.cockpitX) * 10) / 10,
  );
});
