import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize, rectangle } from '../src/model.ts';
import { normalizeRoom, evaluateRoom, moveRoomTarget, wallFrame } from '../src/room.ts';
import { roomControls } from '../src/room-editor.ts';
import { createProject, readProject, projectData } from '../src/project.ts';

const room = (more = {}) =>
  normalizeRoom({
    ...structuredClone(defaults),
    roomX: 0,
    roomZ: 0,
    roomW: 400,
    roomD: 300,
    roomH: 250,
    ...more,
  });
const shelf = (more = {}) => ({
  id: 'alta',
  type: 'wallShelf',
  name: 'Estantería alta',
  mountWall: 'north',
  offset: 50,
  width: 100,
  depth: 30,
  height: 40,
  elevation: 140,
  ...more,
});
const low = (height = 100) => ({
  id: 'baja',
  type: 'shelf',
  name: 'Estantería baja',
  x: 100,
  z: 15,
  width: 100,
  depth: 30,
  height,
  angle: 0,
});

test('a wall shelf rests inside all four walls and dragging keeps its height and wall', () => {
  for (const mountWall of ['north', 'east', 'south', 'west']) {
    const s = room({ roomX: -50, roomZ: 20, roomFurniture: [shelf({ mountWall })] }),
      f = wallFrame(s, mountWall),
      item = s.roomFurniture[0],
      e = evaluateRoom(s, []);
    const normalDistances = e.furniture[0].polygon.map(
      (p) => (p.x - f.x) * f.nx + (p.z - f.z) * f.nz,
    );
    assert.ok(Math.abs(Math.min(...normalDistances)) < 1e-8, mountWall);
    assert.ok(Math.abs(Math.max(...normalDistances) - 30) < 1e-8, mountWall);
    assert.ok(!e.checks.some((c) => c.id === 'room-out-alta'), mountWall);
    const moved = moveRoomTarget(
      s,
      'furniture:alta',
      item.x + f.tx * 30 + f.nx * 90,
      item.z + f.tz * 30 + f.nz * 90,
    ).roomFurniture[0];
    assert.equal(moved.offset, 80);
    assert.equal(moved.elevation, 140);
    assert.equal(moved.mountWall, mountWall);
    assert.equal(
      moveRoomTarget(s, 'furniture:alta', f.x + f.tx * 2000, f.z + f.tz * 2000).roomFurniture[0]
        .offset,
      f.length - 100,
    );
    assert.equal(s.roomFurniture[0].offset, 50);
  }
});

test('two shelves share the plan without interference when their heights allow it', () => {
  for (const [height, collides] of [
    [100, false],
    [140, false],
    [140.05, false],
    [141, true],
    [180, true],
  ]) {
    const e = evaluateRoom(room({ roomFurniture: [shelf(), low(height)] }), []);
    assert.equal(e.collisions.includes('alta'), collides, `altura ${height}`);
    assert.equal(
      e.checks.some((c) => c.id === 'room-pair-alta-baja'),
      collides,
    );
  }
  const s = room({ roomFurniture: [shelf(), shelf({ id: 'superior', elevation: 180 })] });
  assert.deepEqual(evaluateRoom(s, []).collisions, []);
  s.roomFurniture[1].elevation = 179;
  assert.deepEqual(evaluateRoom(s, []).collisions, ['alta', 'superior']);
});

test('the raised volume also constrains the setup and the ceiling is checked', () => {
  const s = room({ roomFurniture: [shelf()] }),
    polygon = rectangle(80, 120, 5, 25, { x: 0, z: 0, angle: 0 });
  assert.deepEqual(
    evaluateRoom(s, [{ label: 'Tablero', polygon, y0: 72.5, y1: 75 }]).collisions,
    [],
  );
  assert.deepEqual(evaluateRoom(s, [{ label: 'Monitor', polygon, y0: 150, y1: 190 }]).collisions, [
    'alta',
  ]);
  assert.ok(
    evaluateRoom(room({ roomFurniture: [shelf({ elevation: 220 })] }), []).checks.some(
      (c) => c.id === 'room-out-alta',
    ),
  );
  assert.ok(
    !evaluateRoom(room({ roomFurniture: [shelf({ elevation: 210 })] }), []).checks.some(
      (c) => c.id === 'room-out-alta',
    ),
  );
});

test('a shelf cannot be mounted over a window even with its clearance turned off', () => {
  const window = {
    id: 'ventana',
    name: 'Ventana',
    type: 'window',
    wall: 'north',
    offset: 50,
    width: 100,
    height: 100,
    sill: 100,
    clearance: 0,
  };
  let s = room({ roomFurniture: [shelf()], roomFeatures: [window] });
  assert.equal(evaluateRoom(s, []).checks.find((c) => c.id === 'room-mount-alta').level, 'error');
  s = room({
    roomFurniture: [shelf({ elevation: 205, height: 30 })],
    roomFeatures: [{ ...window, clearance: 60 }],
  });
  assert.ok(!evaluateRoom(s, []).checks.some((c) => c.id === 'room-mount-alta'));
  assert.deepEqual(evaluateRoom(s, []).windowHits, []);
});

test('a door checks a shelf at its height and leaves one above the lintel clear', () => {
  const door = {
    id: 'puerta',
    type: 'door',
    wall: 'north',
    offset: 50,
    width: 100,
    height: 205,
    openAngle: 90,
  };
  const blocked = evaluateRoom(room({ roomFurniture: [shelf()], roomFeatures: [door] }), []);
  assert.deepEqual(blocked.doorHits, ['puerta']);
  const above = evaluateRoom(
    room({ roomFurniture: [shelf({ elevation: 210, height: 30 })], roomFeatures: [door] }),
    [],
  );
  assert.deepEqual(above.doorHits, []);
  assert.deepEqual(above.collisions, []);
});

test('saving keeps the wall, height and position, and v1 furniture still imports', () => {
  const p = createProject();
  p.config = room({
    roomFurniture: [shelf({ mountWall: 'east', offset: 73.5, elevation: 155.5 }), low()],
  });
  p.setup = { step: 'furniture', furthest: 2, deferred: [] };
  const restored = readProject(JSON.parse(JSON.stringify(projectData(p.config, p.setup))));
  assert.deepEqual(restored.config, p.config);
  assert.equal(restored.setup.step, 'furniture');
  const old = readProject({
    app: 'Cockpit Lab',
    version: 1,
    config: { ...defaults, roomFurniture: [low()] },
  });
  assert.equal(old.config.roomFurniture[0].type, 'shelf');
  assert.equal(evaluateRoom(old.config, []).furniture[0].y0, 0);
  const invalid = sanitize({
    ...p.config,
    roomFurniture: [shelf({ mountWall: 'desconocida', offset: Infinity, elevation: NaN })],
  });
  assert.equal(invalid.roomFurniture[0].mountWall, 'north');
  assert.equal(invalid.roomFurniture[0].elevation, 140);
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(invalid))), invalid);
});

test('the furniture panel offers wall and height without the free rotation controls', () => {
  const s = room({ roomFurniture: [shelf()] }),
    html = roomControls(
      s,
      evaluateRoom(s, []),
      'furniture:alta',
      () => '',
      () => '',
      { mode: 'furniture' },
    );
  assert.ok(html.includes('data-add-room="wallShelf"'));
  assert.ok(html.includes('data-room-key="mountWall"'));
  assert.ok(html.includes('data-room-key="elevation"'));
  assert.ok(!html.includes('data-room-key="angle"'));
  assert.ok(!html.includes('data-room-key="x"'));
  assert.ok(html.includes('data-room-key="offset"'));
});
