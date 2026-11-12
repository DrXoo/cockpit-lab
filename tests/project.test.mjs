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
  advanceSetup,
  completeSetup,
} from '../src/project.ts';
import {
  createLayoutLibrary,
  layoutConfig,
  duplicateLayout,
  recordLayout,
  hideFurniture,
} from '../src/layouts.ts';
import { partialSummary } from '../src/project-summary.ts';

const configOf = (project) => layoutConfig(project.library);

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
    JSON.parse(JSON.stringify(projectData(createLayoutLibrary(config), p.setup))),
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
  assert.deepEqual(configOf(readProject(projectData(p.library, p.setup))), configOf(p));
  assert.equal(readProject({ version: 1, config: old }, { stored: true }).setup.step, 'complete');
});
test('the reader rejects inconsistent progress, wrong units and invalid item presence', () => {
  const p = createProject(),
    data = { app: 'Cockpit Lab', version: 2, units: 'cm', config: configOf(p), setup: p.setup };
  assert.throws(() => readProject({ ...data, units: 'mm' }));
  assert.throws(() => readProject({ ...data, version: 4 }));
  assert.throws(() => readProject({ ...data, config: { ...configOf(p), deskEnabled: 'false' } }));
  assert.throws(() =>
    readProject({ ...data, setup: { step: 'cockpit', furthest: 0, deferred: [] } }),
  );
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
test('a cockpit can be finished without a desk, keeping the deferred steps', () => {
  const p = createProject();
  let config = { ...configOf(p), roomEnabled: true };
  p.setup = advanceSetup(p.setup);
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup = advanceSetup(p.setup, { defer: true });
  config = { ...config, cockpitEnabled: true };
  p.setup = advanceSetup(p.setup);
  const restored = readProject(projectData(createLayoutLibrary(config), p.setup));
  assert.equal(restored.setup.step, 'complete');
  assert.equal(configOf(restored).deskEnabled, false);
  assert.deepEqual(restored.setup.deferred, ['openings', 'furniture', 'desk']);
  assert.ok(evaluate(configOf(restored)).cuts > 0);
});
test('an older design with the room turned off can still be saved', () => {
  const old = readProject({
    app: 'Cockpit Lab',
    version: 1,
    config: { ...defaults, roomEnabled: false },
  });
  const p = readProject(projectData(old.library, old.setup));
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
  let library = duplicateLayout(createLayoutLibrary(config), 'Prueba');
  library = recordLayout(library, { ...layoutConfig(library), cockpitX: 30, keyboardZ: 5 });
  return hideFurniture(library, 'bed');
};

test('a project with several layouts reads back with the same layouts', () => {
  const library = designWithLayouts();
  const file = JSON.parse(JSON.stringify(projectData(library, completeSetup())));
  assert.equal(file.version, 3);
  assert.deepEqual(readProject(file), { library, setup: { ...completeSetup(), drafts: {} } });
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
  assert.deepEqual(layoutConfig(p.library), sanitize(config));
});

test('the reader rejects layouts that do not match the shared furniture', () => {
  const file = JSON.parse(JSON.stringify(projectData(designWithLayouts(), completeSetup())));
  const withLayout = (change) => ({
    ...file,
    layouts: [{ ...file.layouts[0], ...change }, file.layouts[1]],
  });
  assert.throws(() => readProject({ ...file, layouts: [] }), /layouts/);
  assert.throws(() => readProject(withLayout({ furniture: {} })), /placement/);
  assert.throws(() => readProject(withLayout({ hiddenFurniture: ['sofa'] })), /hidden/);
  assert.throws(() => readProject(withLayout({ id: file.layouts[1].id })), /layout id/);
  assert.throws(() => readProject(withLayout({ settings: { cockpitX: 'far' } })), /cockpitX/);
  assert.throws(() => readProject({ ...file, activeLayoutId: 'layout-9' }), /active layout/);
  assert.throws(() =>
    readProject({
      ...file,
      shared: {
        ...file.shared,
        roomFurniture: [...file.shared.roomFurniture, file.shared.roomFurniture[0]],
      },
    }),
  );
});
