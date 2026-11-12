import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize } from '../src/model.ts';
import { addRoomItem, deleteRoomItem, updateRoomItem } from '../src/room-actions.ts';
import {
  createLayoutLibrary,
  layoutConfig,
  recordLayout,
  duplicateLayout,
  selectLayout,
  renameLayout,
  deleteLayout,
  hideFurniture,
  showFurniture,
  layoutById,
} from '../src/layouts.ts';
import { saveArmPose } from '../src/arm-poses.ts';

const room = sanitize({
  ...defaults,
  roomX: 0,
  roomZ: 0,
  roomW: 400,
  roomD: 400,
  roomFurniture: [
    { id: 'bed', type: 'bed', name: 'Bed', x: 100, z: 300, width: 140, depth: 200, height: 60 },
    {
      id: 'shelf',
      type: 'wallShelf',
      name: 'Shelf',
      mountWall: 'north',
      offset: 50,
      width: 100,
      depth: 30,
      height: 40,
      elevation: 140,
    },
  ],
});

const furniture = (config, id) => config.roomFurniture.find((item) => item.id === id);

test('a new library has one layout that reproduces the configuration', () => {
  const library = createLayoutLibrary(room);
  assert.equal(library.layouts.length, 1);
  assert.equal(library.layouts[0].name, 'Base');
  assert.equal(library.activeLayoutId, library.layouts[0].id);
  assert.deepEqual(layoutConfig(library), room);
});

test('a duplicated layout becomes active and starts as a copy of the original', () => {
  const base = createLayoutLibrary(room);
  const library = duplicateLayout(base, 'Desk by the window');
  assert.equal(library.layouts.length, 2);
  assert.notEqual(library.activeLayoutId, base.activeLayoutId);
  assert.equal(library.layouts[1].name, 'Desk by the window');
  assert.deepEqual(layoutConfig(library), room);
});

test('moving the cockpit, desk or furniture changes only the active layout', () => {
  const base = createLayoutLibrary(room);
  const baseId = base.activeLayoutId;
  let library = duplicateLayout(base, 'Trial');
  let config = { ...layoutConfig(library), cockpitX: 150, deskAngle: 90 };
  config = updateRoomItem(config, 'furniture:bed', 'x', 250);
  library = recordLayout(library, config);

  assert.deepEqual(layoutConfig(library), config);
  const original = layoutConfig(selectLayout(library, baseId));
  assert.equal(original.cockpitX, room.cockpitX);
  assert.equal(original.deskAngle, room.deskAngle);
  assert.equal(furniture(original, 'bed').x, 100);
});

test('desktop items and the monitor arm pose are stored per layout', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Trial');
  library = recordLayout(library, {
    ...layoutConfig(library),
    keyboardZ: 10,
    matAngle: 90,
    monitorMode: 'manual',
    armBaseAngle: 45,
    clampSide: 'zmax',
  });
  const original = layoutConfig(selectLayout(library, base.activeLayoutId));
  assert.equal(original.keyboardZ, room.keyboardZ);
  assert.equal(original.matAngle, room.matAngle);
  assert.equal(original.monitorMode, room.monitorMode);
  assert.equal(original.armBaseAngle, room.armBaseAngle);
  assert.equal(original.clampSide, room.clampSide);
});

test('each layout keeps its own arm poses, and a duplicate starts with a copy', () => {
  const base = recordLayout(createLayoutLibrary(room), saveArmPose(room, 'Racing'));
  const copy = duplicateLayout(base, 'Trial');
  assert.deepEqual(
    layoutConfig(copy).armPoses.map((pose) => pose.name),
    ['Racing'],
  );
  const edited = recordLayout(copy, saveArmPose(layoutConfig(copy), 'Desk'));
  assert.deepEqual(
    layoutConfig(edited).armPoses.map((pose) => pose.name),
    ['Racing', 'Desk'],
  );
  assert.deepEqual(
    layoutConfig(edited, 'layout-1').armPoses.map((pose) => pose.name),
    ['Racing'],
  );
});

test('a wall shelf keeps its wall, offset and height per layout', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Trial');
  let config = updateRoomItem(layoutConfig(library), 'furniture:shelf', 'mountWall', 'east');
  config = updateRoomItem(config, 'furniture:shelf', 'elevation', 100);
  library = recordLayout(library, config);
  const original = furniture(layoutConfig(selectLayout(library, base.activeLayoutId)), 'shelf');
  assert.deepEqual(original, furniture(room, 'shelf'));
  assert.equal(furniture(layoutConfig(library), 'shelf').mountWall, 'east');
});

test('the room, the furniture sizes and the cockpit design are shared by every layout', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Trial');
  let config = { ...layoutConfig(library), roomW: 380, seatH: 40, deskWidth: 160 };
  config = updateRoomItem(config, 'furniture:bed', 'width', 90);
  library = recordLayout(library, config);
  const original = layoutConfig(selectLayout(library, base.activeLayoutId));
  assert.equal(original.roomW, 380);
  assert.equal(original.seatH, 40);
  assert.equal(original.deskWidth, 160);
  assert.equal(furniture(original, 'bed').width, 90);
  assert.equal(furniture(original, 'bed').x, 100);
});

test('furniture added in one layout appears in the others where it was created', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Trial');
  const added = addRoomItem(layoutConfig(library), 'cabinet', 'cabinet').state;
  library = recordLayout(library, added);
  library = recordLayout(
    library,
    updateRoomItem(layoutConfig(library), 'furniture:cabinet', 'x', 50),
  );
  const original = layoutConfig(selectLayout(library, base.activeLayoutId));
  assert.deepEqual(furniture(original, 'cabinet'), furniture(added, 'cabinet'));
});

test('furniture deleted in one layout is gone from every layout', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Trial');
  library = recordLayout(library, deleteRoomItem(layoutConfig(library), 'furniture:bed'));
  const original = layoutConfig(selectLayout(library, base.activeLayoutId));
  assert.equal(furniture(original, 'bed'), undefined);
});

test('hidden furniture leaves only the active layout and comes back where it was', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Without the bed');
  library = hideFurniture(library, 'bed');
  assert.equal(furniture(layoutConfig(library), 'bed'), undefined);
  assert.deepEqual(library.layouts[1].hiddenFurniture, ['bed']);

  library = recordLayout(library, { ...layoutConfig(library), cockpitX: 120 });
  const original = layoutConfig(selectLayout(library, base.activeLayoutId));
  assert.deepEqual(furniture(original, 'bed'), furniture(room, 'bed'));

  library = showFurniture(library, 'bed');
  assert.deepEqual(furniture(layoutConfig(library), 'bed'), furniture(room, 'bed'));
  assert.deepEqual(library.layouts[1].hiddenFurniture, []);
});

test('furniture hidden in another layout follows shared changes and deletions', () => {
  const base = hideFurniture(createLayoutLibrary(room), 'bed');
  let library = duplicateLayout(base, 'With the bed');
  library = showFurniture(library, 'bed');
  library = recordLayout(
    library,
    updateRoomItem(layoutConfig(library), 'furniture:bed', 'width', 90),
  );
  const hiddenBed = showFurniture(selectLayout(library, base.activeLayoutId), 'bed');
  assert.equal(furniture(layoutConfig(hiddenBed), 'bed').width, 90);

  library = recordLayout(library, deleteRoomItem(layoutConfig(library), 'furniture:bed'));
  assert.deepEqual(layoutById(library, base.activeLayoutId).hiddenFurniture, []);
});

test('a layout lists its furniture in the shared order, hidden items included', () => {
  let library = hideFurniture(createLayoutLibrary(room), 'bed');
  library = recordLayout(library, addRoomItem(layoutConfig(library), 'cabinet', 'cabinet').state);
  library = showFurniture(library, 'bed');
  assert.deepEqual(
    layoutConfig(library).roomFurniture.map((item) => item.id),
    ['bed', 'shelf', 'cabinet'],
  );
});

test('a layout fits shared changes that leave its items out of place', () => {
  const base = createLayoutLibrary({ ...room, keyboardZ: 60, deskWidth: 160 });
  let library = duplicateLayout(base, 'Trial');
  library = recordLayout(library, { ...layoutConfig(library), deskWidth: 120 });
  const original = layoutConfig(selectLayout(library, base.activeLayoutId));
  assert.ok(Math.abs(original.keyboardZ) + original.keyboardWidth / 2 <= 60);
});

test('layouts can be renamed and deleted, but the last one stays', () => {
  const base = createLayoutLibrary(room);
  let library = duplicateLayout(base, 'Trial');
  library = renameLayout(library, library.activeLayoutId, '  Final <b>  ');
  assert.equal(library.layouts[1].name, 'Final b');
  library = deleteLayout(library, library.activeLayoutId);
  assert.equal(library.layouts.length, 1);
  assert.equal(library.activeLayoutId, base.activeLayoutId);
  assert.throws(() => deleteLayout(library, library.activeLayoutId), /last layout/);
});

test('a blank name falls back to a numbered one', () => {
  const library = duplicateLayout(createLayoutLibrary(room), '   ');
  assert.equal(library.layouts[1].name, 'Layout 2');
});

test('new layouts never reuse the id of an existing one', () => {
  let library = duplicateLayout(createLayoutLibrary(room), 'Second');
  library = duplicateLayout(library, 'Third');
  library = deleteLayout(library, library.layouts[1].id);
  library = duplicateLayout(library, 'Fourth');
  const ids = library.layouts.map((layout) => layout.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('an unknown layout is an error', () => {
  const library = createLayoutLibrary(room);
  assert.throws(() => selectLayout(library, 'nope'), /Unknown layout/);
});
