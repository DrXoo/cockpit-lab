import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize, evaluate, rectangle } from '../dist/model.js';
import {
  normalizeRoom,
  wallFrame,
  featureGeometry,
  evaluateRoom,
  moveRoomTarget,
} from '../dist/room.js';
const base = () => ({
  ...structuredClone(defaults),
  roomX: 0,
  roomZ: 0,
  roomW: 400,
  roomD: 400,
  roomH: 250,
});
const door = (overrides = {}) => ({
  id: 'door',
  type: 'door',
  name: 'Entrada',
  wall: 'north',
  offset: 50,
  width: 80,
  height: 205,
  hinge: 'start',
  swing: 'in',
  openAngle: 90,
  ...overrides,
});
const obstacle = (x, z, w = 8, d = 8, y0 = 0, y1 = 90) => ({
  label: 'Prueba',
  polygon: rectangle(-w / 2, w / 2, -d / 2, d / 2, { x, z, angle: 0 }),
  y0,
  y1,
});

test('Old JSONs add an empty room while preserving all cockpit and desk positions', () => {
  const old = { ...base() };
  delete old.roomFeatures;
  delete old.roomFurniture;
  delete old.roomH;
  const s = sanitize(old);
  assert.deepEqual(s.roomFeatures, []);
  assert.deepEqual(s.roomFurniture, []);
  assert.equal(s.roomH, 250);
  assert.equal(s.deskX, old.deskX);
  assert.equal(s.cockpitZ, old.cockpitZ);
});
test('The complete door swing catches an obstacle missed by the fully open leaf', () => {
  const s = normalizeRoom({ ...base(), roomFeatures: [door()] });
  const result = evaluateRoom(s, [obstacle(90, 40)]);
  assert.deepEqual(result.doorHits, ['door']);
  assert.equal(result.checks.find((c) => c.id === 'room-door-door').level, 'error');
  assert.equal(evaluateRoom(s, [obstacle(150, 100)]).doorHits.length, 0);
});
test('Door sweep follows all four walls, either hinge and inward or outward opening', () => {
  for (const wall of ['north', 'east', 'south', 'west'])
    for (const hinge of ['start', 'end'])
      for (const swing of ['in', 'out']) {
        const s = normalizeRoom({ ...base(), roomFeatures: [door({ wall, hinge, swing })] }),
          g = featureGeometry(s, s.roomFeatures[0]),
          f = wallFrame(s, wall),
          sign = hinge === 'start' ? 1 : -1,
          inside = swing === 'in' ? 1 : -1;
        const x = g.hingePoint.x + (f.tx * sign + f.nx * inside) * 35,
          z = g.hingePoint.z + (f.tz * sign + f.nz * inside) * 35;
        assert.equal(
          evaluateRoom(s, [obstacle(x, z)]).doorHits.length,
          1,
          `${wall}/${hinge}/${swing}`,
        );
      }
});
test('Door angle and obstacle height affect interference', () => {
  const hit = obstacle(90, 40),
    s = normalizeRoom({ ...base(), roomFeatures: [door({ openAngle: 20 })] });
  assert.equal(evaluateRoom(s, [hit]).doorHits.length, 0);
  s.roomFeatures[0].openAngle = 90;
  assert.equal(evaluateRoom(s, [hit]).doorHits.length, 1);
  assert.equal(evaluateRoom(s, [obstacle(90, 40, 8, 8, 210, 230)]).doorHits.length, 0);
});
test('Furniture collision uses rotated footprints and vertical volumes', () => {
  const s = normalizeRoom({
    ...base(),
    roomFurniture: [
      {
        id: 'shelf',
        name: 'Baja',
        type: 'shelf',
        x: 200,
        z: 200,
        width: 100,
        depth: 30,
        height: 50,
        angle: 45,
      },
    ],
  });
  assert.equal(evaluateRoom(s, [obstacle(200, 200, 10, 10, 0, 40)]).collisions.length, 1);
  assert.equal(evaluateRoom(s, [obstacle(200, 200, 10, 10, 60, 80)]).collisions.length, 0);
  assert.equal(evaluateRoom(s, [obstacle(250, 250)]).collisions.length, 0);
});
test('Window clearance is an advisory reservation and can be disabled', () => {
  const s = normalizeRoom({
    ...base(),
    roomFeatures: [
      {
        id: 'window',
        name: 'Ventana',
        type: 'window',
        wall: 'north',
        offset: 50,
        width: 100,
        height: 100,
        sill: 100,
        clearance: 60,
      },
    ],
  });
  const result = evaluateRoom(s, [obstacle(100, 40)]);
  assert.deepEqual(result.windowHits, ['window']);
  assert.equal(result.checks.find((c) => c.id === 'room-window-window').level, 'warning');
  s.roomFeatures[0].clearance = 0;
  assert.equal(evaluateRoom(s, [obstacle(100, 40)]).windowHits.length, 0);
});
test('Resize clamps wall openings, preserves furniture placement, and flags overlapping holes', () => {
  const s = normalizeRoom({
    ...base(),
    roomW: 140,
    roomFeatures: [
      door({ offset: 120, width: 100 }),
      { id: 'window', type: 'window', wall: 'north', offset: 50, width: 80, sill: 20, height: 100 },
    ],
    roomFurniture: [{ id: 'f', x: 390, z: 390, width: 80, depth: 50, height: 180 }],
  });
  assert.equal(s.roomFeatures[0].offset, 40);
  assert.equal(s.roomFurniture[0].x, 390);
  const e = evaluateRoom(s, []);
  assert.ok(e.checks.some((v) => v.id.startsWith('room-openings-')));
  assert.ok(e.checks.some((v) => v.id === 'room-out-f'));
});
test('Dragging moves furniture freely and constrains openings to their chosen wall', () => {
  const s = normalizeRoom({
    ...base(),
    roomFeatures: [door()],
    roomFurniture: [{ id: 'f', x: 100, z: 100 }],
  });
  const moved = moveRoomTarget(s, 'feature:door', 1000, -30);
  assert.equal(moved.roomFeatures[0].wall, 'north');
  assert.equal(moved.roomFeatures[0].offset, 320);
  assert.equal(moveRoomTarget(s, 'furniture:f', 145, 120).roomFurniture[0].x, 145);
  assert.equal(s.roomFurniture[0].x, 100);
});
test('Room data round-trips and rejects unsafe names, bad numbers, and duplicate identifiers', () => {
  const s = sanitize({
    ...base(),
    roomFeatures: [door({ name: '<img src=x>', width: Infinity }), door()],
    roomFurniture: [{ id: 'door', name: '<script>', x: Infinity }],
  });
  assert.equal(s.roomFeatures[0].width, 80);
  assert.ok(!s.roomFeatures[0].name.includes('<'));
  assert.equal(new Set([...s.roomFeatures, ...s.roomFurniture].map((v) => v.id)).size, 3);
  assert.ok(Number.isFinite(s.roomFurniture[0].x));
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))), s);
});
test('Disabling the room suppresses room limits and opening/furniture checks', () => {
  const s = sanitize({
    ...base(),
    roomEnabled: false,
    roomW: 120,
    deskX: 1000,
    roomFeatures: [door()],
    roomFurniture: [{ id: 'f', x: 1000, z: 100, width: 100, depth: 100, height: 350 }],
  });
  const e = evaluate(s);
  assert.deepEqual(e.room.checks, []);
  assert.ok(!e.extra.some((c) => c.id === 'room'));
});
