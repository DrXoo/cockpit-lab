import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, rectangle, evaluate } from '../src/model.ts';
import { normalizeRoom, evaluateRoom, moveRoomTarget, wallFrame } from '../src/room.ts';
import { roomControls, roomItems } from '../src/room-editor.ts';
import {
  createProject,
  readProject,
  projectData,
  projectConfig,
  projectFromConfig,
} from '../src/project.ts';

const access = (more = {}) => ({
  id: 'armario',
  type: 'wardrobeAccess',
  name: 'Armario empotrado',
  wall: 'north',
  offset: 50,
  width: 180,
  clearance: 80,
  ...more,
});
const room = (more = {}) =>
  normalizeRoom({
    ...projectConfig(createProject()),
    roomEnabled: true,
    roomX: 0,
    roomZ: 0,
    roomW: 400,
    roomD: 300,
    roomH: 250,
    roomFeatures: [access()],
    ...more,
  });
const obstacle = (x, z, label = 'Mueble', y0 = 0, y1 = 100) => ({
  label,
  polygon: rectangle(-10, 10, -10, 10, { x, z, angle: 0 }),
  y0,
  y1,
});

test('a built-in wardrobe keeps access clear inwards from each wall, without an inside or a swing', () => {
  for (const wall of ['north', 'east', 'south', 'west']) {
    const s = room({ roomFeatures: [access({ wall })] }),
      e = evaluateRoom(s, []),
      item = e.features[0],
      f = wallFrame(s, wall);
    assert.deepEqual(e.furniture, []);
    assert.deepEqual(item.sectors, []);
    assert.equal(item.leaf, undefined);
    assert.equal(item.arc, undefined);
    const normal = item.reserve.map((p) => (p.x - f.x) * f.nx + (p.z - f.z) * f.nz),
      along = item.reserve.map((p) => (p.x - f.x) * f.tx + (p.z - f.z) * f.tz);
    assert.ok(Math.abs(Math.min(...normal)) < 1e-8);
    assert.ok(Math.abs(Math.max(...normal) - 80) < 1e-8);
    assert.ok(Math.abs(Math.min(...along) - 50) < 1e-8);
    assert.ok(Math.abs(Math.max(...along) - 230) < 1e-8);
    assert.equal(e.checks.find((c) => c.id === 'room-access-armario').value, 'Access clear');
    const inward = obstacle(item.center.x + f.nx * 30, item.center.z + f.nz * 30),
      behind = obstacle(item.center.x - f.nx * 30, item.center.z - f.nz * 30);
    assert.deepEqual(evaluateRoom(s, [inward]).accessHits, ['armario']);
    assert.deepEqual(evaluateRoom(s, [behind]).accessHits, []);
  }
});

test('blocked access warns without inventing a physical collision or a window', () => {
  const s = room(),
    e = evaluateRoom(s, [
      obstacle(100, 40, 'Escritorio'),
      obstacle(120, 40, 'Cockpit'),
      obstacle(130, 40, 'Escritorio'),
    ]),
    check = e.checks.find((c) => c.id === 'room-access-armario');
  assert.equal(check.value, 'Access blocked');
  assert.equal(check.level, 'warning');
  assert.ok(check.detail.includes('Escritorio · Cockpit'));
  assert.deepEqual(e.collisions, []);
  assert.deepEqual(e.doorHits, []);
  assert.deepEqual(e.windowHits, []);
  assert.deepEqual(
    evaluateRoom(s, [obstacle(100, 90)]).accessHits,
    [],
    'El contacto con el borde no ocupa la reserva',
  );
  assert.deepEqual(
    evaluateRoom(s, [obstacle(100, 89.9)]).accessHits,
    [],
    'Se conserva la tolerancia de 0,15 cm',
  );
  assert.deepEqual(evaluateRoom(s, [obstacle(100, 89)]).accessHits, ['armario']);
  assert.deepEqual(
    evaluateRoom(s, [obstacle(100, 30, 'Por encima del techo', 260, 280)]).accessHits,
    [],
  );
});

test('the full evaluation takes in furniture, the desk and the cockpit in front of sliding doors', () => {
  const furniture = {
    id: 'cajonera',
    type: 'cabinet',
    name: 'Cajonera',
    x: 100,
    z: 40,
    width: 30,
    depth: 30,
    height: 60,
  };
  const cases = [
    { roomFurniture: [furniture] },
    { deskEnabled: true, deskX: 100, deskZ: 60 },
    { cockpitEnabled: true, cockpitX: 100, cockpitZ: 20 },
  ];
  for (const extra of cases) {
    const e = evaluate(room(extra));
    assert.deepEqual(e.room.accessHits, ['armario']);
    assert.equal(e.room.checks.find((c) => c.id === 'room-access-armario').level, 'warning');
  }
  const e = evaluate(room());
  assert.deepEqual(e.parts, []);
  assert.deepEqual(e.accessories, []);
});

test('dragging keeps the wall and allows wide fronts without inside measurements', () => {
  const s = room({ roomW: 500, roomFeatures: [access({ width: 420 })] });
  assert.equal(s.roomFeatures[0].width, 420);
  assert.equal(moveRoomTarget(s, 'feature:armario', 2000, -100).roomFeatures[0].offset, 80);
  const smaller = normalizeRoom({ ...s, roomW: 140 });
  assert.equal(smaller.roomFeatures[0].width, 140);
  assert.equal(smaller.roomFeatures[0].offset, 0);
  const disabled = evaluateRoom(room({ roomFeatures: [access({ clearance: 0 })] }), [
    obstacle(100, 10),
  ]);
  assert.equal(disabled.checks.find((c) => c.id === 'room-access-armario').value, 'Clearance off');
  assert.deepEqual(disabled.accessHits, []);
  const outside = evaluateRoom(
    room({ roomD: 120, roomFeatures: [access({ clearance: 200 })] }),
    [],
  );
  assert.equal(
    outside.checks.find((c) => c.id === 'room-access-armario').value,
    'Clearance outside the room',
  );
  assert.deepEqual(evaluateRoom({ ...s, roomEnabled: false }, [obstacle(100, 40)]).checks, []);
});

test('access coexists with openings and detects overlapping mounts or fronts', () => {
  const s = room({
    roomFeatures: [
      access(),
      {
        id: 'ventana',
        type: 'window',
        wall: 'north',
        offset: 70,
        width: 100,
        sill: 100,
        height: 100,
        clearance: 0,
      },
    ],
    roomFurniture: [
      {
        id: 'estante',
        type: 'wallShelf',
        mountWall: 'north',
        offset: 100,
        width: 80,
        height: 30,
        elevation: 160,
      },
    ],
  });
  const e = evaluateRoom(s, []);
  assert.ok(e.checks.some((c) => c.id === 'room-openings-armario-ventana' && c.level === 'error'));
  assert.ok(
    e.checks.some((c) => c.id === 'room-mount-estante' && c.detail.includes('Armario empotrado')),
  );
});

test('the project keeps the access and older files still open', () => {
  const p = createProject();
  const config = room({
    roomFeatures: [access({ wall: 'west', offset: 22.5, width: 200, clearance: 95 })],
  });
  p.setup = { step: 'furniture', furthest: 2, deferred: [] };
  const restored = readProject(
    JSON.parse(JSON.stringify(projectData(projectFromConfig(config, p.setup)))),
  );
  assert.deepEqual(projectConfig(restored), config);
  assert.equal(restored.setup.step, 'furniture');
  const old = readProject({
    app: 'Cockpit Lab',
    version: 1,
    config: { ...defaults, roomFeatures: [] },
  });
  assert.deepEqual(projectConfig(old).roomFeatures, []);
  const resized = normalizeRoom({ ...config, roomH: 280 });
  assert.equal(resized.roomFeatures[0].height, 250);
});

test('it is added and selected in Furniture with wall, width, height, position and clearance', () => {
  const s = room(),
    items = roomItems(s, 'furniture');
  assert.equal(items[0].type, 'wardrobeAccess');
  assert.deepEqual(roomItems(s, 'openings'), []);
  const html = roomControls(
    s,
    evaluateRoom(s, []),
    'feature:armario',
    () => '',
    () => '',
    { mode: 'furniture' },
  );
  assert.ok(html.includes('data-add-room="wardrobeAccess"'));
  assert.ok(html.includes('value="feature:armario" selected'));
  for (const key of ['wall', 'offset', 'width', 'height', 'clearance'])
    assert.ok(html.includes(`data-room-key="${key}"`));
  for (const key of ['depth', 'openAngle', 'hinge'])
    assert.ok(!html.includes(`data-room-key="${key}"`));
});

test('the door height allows a shelf above and detects intrusions below', () => {
  const highShelf = {
    id: 'alta',
    type: 'wallShelf',
    mountWall: 'north',
    offset: 70,
    width: 100,
    depth: 30,
    height: 20,
    elevation: 220,
  };
  for (const [elevation, blocked] of [
    [220, false],
    [210, false],
    [209.95, false],
    [209.5, true],
  ]) {
    const s = room({
        roomFeatures: [access({ height: 210 })],
        roomFurniture: [{ ...highShelf, elevation }],
      }),
      e = evaluateRoom(s, []);
    assert.equal(e.accessHits.includes('armario'), blocked, `base ${elevation}`);
    assert.equal(
      e.checks.some((c) => c.id === 'room-mount-alta'),
      blocked,
      `anclaje ${elevation}`,
    );
  }
});

test('the edited height is saved and limited to the ceiling; accesses without a height stay compatible', () => {
  const p = createProject();
  const config = room({ roomFeatures: [access({ height: 212.5 })] });
  p.setup = { step: 'furniture', furthest: 2, deferred: [] };
  const restored = readProject(
    JSON.parse(JSON.stringify(projectData(projectFromConfig(config, p.setup)))),
  );
  assert.equal(projectConfig(restored).roomFeatures[0].height, 212.5);
  assert.equal(
    normalizeRoom({ ...projectConfig(restored), roomH: 280 }).roomFeatures[0].height,
    212.5,
  );
  assert.equal(
    normalizeRoom({ ...projectConfig(restored), roomH: 200 }).roomFeatures[0].height,
    200,
  );
  assert.equal(room({ roomFeatures: [access()] }).roomFeatures[0].height, 250);
  assert.equal(room({ roomFeatures: [access({ height: Infinity })] }).roomFeatures[0].height, 250);
});
