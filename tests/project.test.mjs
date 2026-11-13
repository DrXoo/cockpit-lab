import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  evaluate,
  getParts,
  getDesktopItems,
  resizeDesk,
  sanitize,
} from '../src/model.ts';
import {
  createProject,
  readProject,
  projectData,
  projectConfig,
  projectFromConfig,
  recordProject,
  advanceSetup,
  completeSetup,
} from '../src/project.ts';
import { duplicateLayout, hideFurniture } from '../src/layouts.ts';
import {
  COCKPIT_DESIGN_KEYS,
  cockpitSettings,
  isCockpitDesignSetting,
} from '../src/cockpit-design.ts';
import { partialSummary } from '../src/project-summary.ts';
import { saveArmPose } from '../src/arm-poses.ts';

const configOf = (project) => projectConfig(project);

test('a new project has no items or part list and waits for the room size', () => {
  const p = createProject(),
    e = evaluate(configOf(p));
  assert.equal(p.setup.step, 'room');
  assert.equal(configOf(p).roomEnabled, false);
  assert.deepEqual(e.rigPolygon, []);
  assert.deepEqual(e.deskPolygon, []);
  assert.deepEqual(e.desktopItems, []);
  assert.equal(e.body, null);
  assert.deepEqual(e.checks, []);
  assert.equal(e.spaceW, 0);
  assert.equal(e.cuts, 0);
  assert.deepEqual(e.accessories, []);
});
test('items not yet added neither block furniture or doors nor affect the quantities', () => {
  const s = {
    ...configOf(createProject()),
    roomEnabled: true,
    roomW: 500,
    roomD: 500,
    roomFurniture: [
      {
        id: 'mueble',
        type: 'wardrobe',
        name: 'Armario',
        x: defaults.deskX,
        z: defaults.deskZ,
        width: 80,
        depth: 80,
        height: 200,
        angle: 0,
      },
    ],
    roomFeatures: [
      {
        id: 'puerta',
        type: 'door',
        name: 'Puerta',
        wall: 'north',
        offset: 0,
        width: 80,
        height: 205,
        sill: 0,
        hinge: 'start',
        swing: 'in',
        openAngle: 90,
        clearance: 0,
      },
    ],
  };
  const e = evaluate(s);
  assert.equal(e.errors, 0);
  assert.equal(e.checks.find((c) => c.id === 'room-door-puerta').value, '90° clear');
  assert.deepEqual(e.bodyCheck, []);
  assert.deepEqual(e.spaceCheck, []);
  assert.deepEqual(e.parts, []);
  assert.ok(evaluate({ ...s, deskEnabled: true }).room.collisions.includes('mueble'));
});
test('adding a desk adds no peripherals and turning an accessory on changes the real model', () => {
  let s = { ...configOf(createProject()), roomEnabled: true, deskEnabled: true };
  s = resizeDesk(s, 160, 80);
  assert.deepEqual(getDesktopItems(s), []);
  assert.deepEqual(getParts(s).accessories, []);
  const e = evaluate({ ...s, keyboardEnabled: true });
  assert.deepEqual(
    e.desktopItems.map((i) => i.id),
    ['keyboard'],
  );
  assert.equal(e.cuts, 0);
  assert.ok(
    !e.checks.some((c) => ['mouse-mat', 'mount', 'arm', 'eyes', 'collision'].includes(c.id)),
  );
  assert.ok(
    !evaluate({ ...s, monitorEnabled: true }).checks.some((c) =>
      ['screen', 'eyes', 'side', 'collision'].includes(c.id),
    ),
  );
});
test('a cockpit on its own gets its part list without an invented desk or arm', () => {
  const e = evaluate({ ...configOf(createProject()), roomEnabled: true, cockpitEnabled: true });
  assert.ok(e.cuts > 0);
  assert.ok(e.bodyCheck.length);
  assert.equal(e.desktopItems.length, 0);
  assert.ok(!e.checks.some((c) => ['arm', 'eyes', 'side', 'collision', 'lift'].includes(c.id)));
  assert.ok(!e.accessories.some((p) => /escritorio|monitor/i.test(p.name + ' ' + p.note)));
});
test('progress resumes at the exact step and keeps the deferred steps', () => {
  const p = createProject();
  const config = { ...configOf(p), roomEnabled: true, roomW: 410 };
  p.setup = advanceSetup(p.setup);
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup.drafts = { desk: { w: '160', d: '', h: '' } };
  const restored = readProject(
    JSON.parse(JSON.stringify(projectData(projectFromConfig(config, p.setup)))),
  );
  assert.equal(restored.setup.step, 'furniture');
  assert.equal(restored.setup.furthest, 2);
  assert.deepEqual(restored.setup.deferred, ['openings']);
  assert.equal(configOf(restored).roomW, 410);
  assert.equal(configOf(restored).deskEnabled, false);
  assert.equal(configOf(restored).cockpitEnabled, false);
  assert.equal(restored.setup.drafts.desk.w, '160');
  assert.equal(restored.setup.drafts.desk.d, '');
});
test('the v1 adapter keeps positions, sizes and items and opens the full editor', () => {
  const old = { ...defaults, deskX: 218, cockpitAngle: 70, length: 155 };
  delete old.deskEnabled;
  delete old.cockpitEnabled;
  const p = readProject({ app: 'Cockpit Lab', version: 1, config: old });
  assert.equal(p.setup.step, 'complete');
  assert.equal(configOf(p).deskX, 218);
  assert.equal(configOf(p).length, 155);
  assert.equal(configOf(p).cockpitAngle, 70);
  assert.equal(configOf(p).deskEnabled, true);
  assert.equal(configOf(p).cockpitEnabled, true);
  assert.equal(getDesktopItems(configOf(p)).length, 5);
  assert.deepEqual(configOf(readProject(projectData(p))), configOf(p));
  assert.equal(readProject({ version: 1, config: old }, { stored: true }).setup.step, 'complete');
});
test('the reader rejects inconsistent progress, wrong units and invalid item presence', () => {
  const p = createProject(),
    data = { app: 'Cockpit Lab', version: 2, units: 'cm', config: configOf(p), setup: p.setup };
  assert.throws(() => readProject({ ...data, units: 'mm' }));
  assert.throws(() => readProject({ ...data, version: 4 }));
  assert.throws(() => readProject({ ...data, config: { ...configOf(p), deskEnabled: 'false' } }));
  assert.throws(() => readProject({ ...data, setup: { step: 'desk', furthest: 0, deferred: [] } }));
  assert.throws(() => readProject({ app: 'Cockpit Lab', version: 1 }));
});
test('the summary of a partial project has no part list or geometry of missing items', () => {
  const p = createProject(),
    html = partialSummary(configOf(p), evaluate(configOf(p)), p.setup);
  assert.ok(html.includes('The room is not set up yet'));
  assert.ok(!html.includes('cut list'));
  assert.ok(!html.includes('side rails'));
  assert.ok(!html.includes('<h3 class="summary-title">Mesa</h3>'));
  assert.ok(!html.includes('<h3 class="summary-title">Cockpit</h3>'));
});
test('the room setup can be finished without a desk, keeping the deferred steps', () => {
  const p = createProject();
  const config = { ...configOf(p), roomEnabled: true };
  p.setup = advanceSetup(p.setup);
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup = advanceSetup(p.setup, { defer: true });
  const restored = readProject(projectData(projectFromConfig(config, p.setup)));
  assert.equal(restored.setup.step, 'complete');
  assert.equal(configOf(restored).deskEnabled, false);
  assert.deepEqual(restored.setup.deferred, ['openings', 'furniture', 'desk']);
});

test('progress saved when the setup had a cockpit step opens without it', () => {
  const config = { ...configOf(createProject()), roomEnabled: true };
  const saved = (setup) =>
    readProject({ app: 'Cockpit Lab', version: 2, units: 'cm', config, setup }).setup;
  assert.deepEqual(
    saved({
      step: 'cockpit',
      furthest: 4,
      deferred: ['openings', 'cockpit'],
      drafts: { preset: 'gt' },
    }),
    { step: 'complete', furthest: 3, deferred: ['openings'], drafts: {} },
  );
  assert.deepEqual(saved({ step: 'desk', furthest: 4, deferred: [] }), {
    step: 'desk',
    furthest: 3,
    deferred: [],
    drafts: {},
  });
});
test('an older design with the room turned off can still be saved', () => {
  const old = readProject({
    app: 'Cockpit Lab',
    version: 1,
    config: { ...defaults, roomEnabled: false },
  });
  const p = readProject(projectData(old));
  assert.equal(configOf(p).roomEnabled, false);
  assert.equal(configOf(p).cockpitEnabled, true);
  assert.equal(p.setup.step, 'complete');
  assert.throws(() =>
    readProject({ app: 'Cockpit Lab', version: 1, units: 'mm', config: defaults }),
  );
});

const designWithLayouts = () => {
  const config = sanitize({
    ...defaults,
    roomFurniture: [
      { id: 'bed', type: 'bed', name: 'Cama', x: 20, z: 150, width: 140, depth: 200, height: 60 },
      { id: 'chair', type: 'chair', name: 'Silla', x: 60, z: 40, width: 65, depth: 65 },
    ],
  });
  const base = projectFromConfig(config, completeSetup());
  let project = { ...base, library: duplicateLayout(base.library, 'Prueba') };
  const moved = { ...projectConfig(project), cockpitX: 30, keyboardZ: 5, seatH: 40 };
  project = recordProject(project, saveArmPose(moved, 'Racing'));
  return { ...project, library: hideFurniture(project.library, 'bed') };
};

test('a project with several layouts reads back with the same layouts', () => {
  const project = designWithLayouts();
  const file = JSON.parse(JSON.stringify(projectData(project)));
  assert.deepEqual(readProject(file), { ...project, setup: { ...completeSetup(), drafts: {} } });
});

test('a project is written as v4, with the cockpit design apart from the room', () => {
  const project = designWithLayouts();
  const file = JSON.parse(JSON.stringify(projectData(project)));
  assert.equal(file.version, 4);
  assert.equal(file.units, 'cm');
  assert.deepEqual(Object.keys(file.cockpit).sort(), [...COCKPIT_DESIGN_KEYS].sort());
  assert.equal(file.cockpit.seatH, 40);
  assert.deepEqual(Object.keys(file.room).sort(), ['activeLayoutId', 'layouts', 'shared']);
  for (const key of Object.keys(file.room.shared)) assert.ok(!isCockpitDesignSetting(key), key);
  assert.equal(file.room.shared.cockpitEnabled, true, 'the room includes the cockpit');
});

/** A project file through JSON, as it is exported and opened again. */
const throughFile = (project) => readProject(JSON.parse(JSON.stringify(projectData(project))));

test('a room can leave the cockpit design out, and the project keeps the design', () => {
  const project = designWithLayouts();
  const left = recordProject(project, { ...configOf(project), cockpitEnabled: false, height: 190 });
  assert.deepEqual(left.cockpit, { ...project.cockpit, height: 190 });
  for (const layout of ['layout-1', 'layout-2']) {
    assert.equal(projectConfig(left, layout).cockpitEnabled, false, layout);
    assert.equal(projectConfig(left, layout).height, 190, layout);
  }
  const restored = throughFile(left);
  assert.deepEqual(restored.cockpit, left.cockpit);
  assert.equal(projectConfig(restored).cockpitEnabled, false);
});

test('v4 files from before rooms could leave the cockpit out include it when there is one', () => {
  const withoutFlag = (project) => {
    const file = JSON.parse(JSON.stringify(projectData(project)));
    delete file.room.shared.cockpitEnabled;
    return file;
  };
  assert.equal(projectConfig(readProject(withoutFlag(designWithLayouts()))).cockpitEnabled, true);
  const noDesign = projectFromConfig(
    sanitize({ ...defaults, cockpitEnabled: false }),
    completeSetup(),
  );
  assert.equal(projectConfig(readProject(withoutFlag(noDesign))).cockpitEnabled, false);
});

/** The same project as the v3 writer stored it: the design among the shared settings. */
const asVersion3 = ({ cockpit, library, setup }) =>
  JSON.parse(
    JSON.stringify({
      app: 'Cockpit Lab',
      version: 3,
      units: 'cm',
      ...library,
      shared: { ...library.shared, ...cockpitSettings(cockpit) },
      setup,
    }),
  );

test('a v3 file opens with the same layouts and its cockpit design', () => {
  const project = designWithLayouts();
  const restored = readProject(asVersion3(project));
  assert.deepEqual(restored, { ...project, setup: { ...completeSetup(), drafts: {} } });
  const noCockpit = projectFromConfig(
    sanitize({ ...defaults, cockpitEnabled: false }),
    completeSetup(),
  );
  assert.equal(readProject(asVersion3(noCockpit)).cockpit, null);
});

test('the v4 reader rejects settings in the wrong place', () => {
  const file = JSON.parse(JSON.stringify(projectData(designWithLayouts())));
  const withRoomShared = (change) => ({
    ...file,
    room: { ...file.room, shared: { ...file.room.shared, ...change } },
  });
  assert.throws(() => readProject({ ...file, cockpit: { ...file.cockpit, roomW: 300 } }), /roomW/);
  assert.throws(() => readProject({ ...file, cockpit: 'GT' }), /cockpit/);
  assert.throws(() => readProject(withRoomShared({ seatH: 40 })), /seatH/);
  assert.throws(
    () => readProject({ ...withRoomShared({ cockpitEnabled: true }), cockpit: null }),
    /cockpit design/,
  );
  assert.throws(() => readProject(withRoomShared({ cockpitX: 10 })), /cockpitX/);
  assert.throws(() => readProject({ ...file, room: null }), /room/);
});

test('the cockpit design is the same in every layout, wherever it was changed', () => {
  const project = designWithLayouts();
  assert.equal(project.cockpit.seatH, 40);
  assert.equal(projectConfig(project, 'layout-1').seatH, 40);
  assert.equal(projectConfig(project, 'layout-1').cockpitX, defaults.cockpitX);
  assert.equal(projectConfig(project, 'layout-2').cockpitX, 30);
});

test('a project without a cockpit has no design, and every layout leaves the cockpit out', () => {
  const p = projectFromConfig(sanitize({ ...defaults, cockpitEnabled: false }), completeSetup());
  assert.equal(p.cockpit, null);
  assert.equal(projectConfig(p).cockpitEnabled, false);
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(projectData(p)))).cockpit, null);
});

test('a v2 file opens as a single layout called Base', () => {
  const config = { ...defaults, cockpitX: 12 };
  const p = readProject({
    app: 'Cockpit Lab',
    version: 2,
    units: 'cm',
    config,
    setup: completeSetup(),
  });
  assert.equal(p.library.layouts.length, 1);
  assert.equal(p.library.layouts[0].name, 'Base');
  assert.deepEqual(projectConfig(p), sanitize(config));
});

test('the reader rejects layouts that do not match the shared furniture', () => {
  const file = JSON.parse(JSON.stringify(projectData(designWithLayouts())));
  const withRoom = (change) => ({ ...file, room: { ...file.room, ...change } });
  const withLayout = (change) =>
    withRoom({ layouts: [{ ...file.room.layouts[0], ...change }, file.room.layouts[1]] });
  assert.throws(() => readProject(withRoom({ layouts: [] })), /layouts/);
  assert.throws(() => readProject(withLayout({ furniture: {} })), /placement/);
  assert.throws(() => readProject(withLayout({ hiddenFurniture: ['sofa'] })), /hidden/);
  assert.throws(() => readProject(withLayout({ id: file.room.layouts[1].id })), /layout id/);
  assert.throws(() => readProject(withLayout({ settings: { cockpitX: 'far' } })), /cockpitX/);
  assert.throws(() => readProject(withRoom({ activeLayoutId: 'layout-9' })), /active layout/);
  const furniture = file.room.shared.roomFurniture;
  assert.throws(
    () =>
      readProject(
        withRoom({
          shared: { ...file.room.shared, roomFurniture: [...furniture, furniture[0]] },
        }),
      ),
    /furniture/,
  );
});
