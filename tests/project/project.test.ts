import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  deskAccessories,
  evaluate,
  getDesktopItems,
  resizeDesk,
  sanitize,
} from '../../src/room/model.ts';
import {
  createProject,
  readProject,
  projectData,
  projectConfig,
  projectFromConfig,
  recordProject,
  replaceCockpitDesign,
  advanceSetup,
  completeSetup,
  type Project,
} from '../../src/project/project.ts';
import type { RoomConfig } from '../../src/room/config.ts';
import { present, withId } from '../support/lookups.ts';
import { duplicateLayout, hideFurniture } from '../../src/room/layouts.ts';
import { emptyDesign } from '../../src/cockpit/design.ts';
import { summaryHTML } from '../../src/project/summary.ts';
import { saveArmPose } from '../../src/room/arm-poses.ts';

const configOf = (project: Project) => projectConfig(project);
/** The project a file opens as. */
const open = (data: unknown, options?: { stored?: boolean }) => readProject(data, options).project;
/** Whether opening the file left out a parametric cockpit. */
const leftOut = (data: unknown) => readProject(data).parametricCockpitLeftOut;
/** A project file through JSON, as it is exported and opened again. */
const throughFile = (project: Project) => open(JSON.parse(JSON.stringify(projectData(project))));

/** The settings of a parametric cockpit, as files before v5 stored it. */
/** `config` as an older file stored it, without `keys`. */
const without = (config: object, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(config).filter(([key]) => !keys.includes(key)));

const PARAMETRIC_COCKPIT = {
  length: 145,
  width: 64,
  baseLift: 0,
  feet: 'level',
  height: 178,
  seatZ: 40,
  seatH: 32,
  recline: 20,
  wheel: true,
  preset: 'gt',
};

test('a new project has no items or accessories and waits for the room size', () => {
  const p = createProject(),
    e = evaluate(configOf(p));
  assert.equal(p.setup.step, 'room');
  assert.equal(p.cockpit, null);
  assert.equal(configOf(p).roomEnabled, false);
  assert.deepEqual(e.deskPolygon, []);
  assert.deepEqual(e.desktopItems, []);
  assert.deepEqual(e.checks, []);
  assert.equal(e.spaceW, 0);
  assert.deepEqual(e.accessories, []);
});
test('items not yet added neither block furniture or doors nor add checks', () => {
  const s: RoomConfig = {
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
  assert.equal(withId(e.checks, 'room-door-puerta').value, '90° clear');
  assert.deepEqual(e.spaceCheck, []);
  assert.deepEqual(e.accessories, []);
  assert.ok(evaluate({ ...s, deskEnabled: true }).room.collisions.includes('mueble'));
});
test('adding a desk adds no accessories and turning one on changes the real model', () => {
  let s = { ...configOf(createProject()), roomEnabled: true, deskEnabled: true };
  s = resizeDesk(s, 160, 80);
  assert.deepEqual(getDesktopItems(s), []);
  assert.deepEqual(deskAccessories(s), []);
  const e = evaluate({ ...s, keyboardEnabled: true });
  assert.deepEqual(
    e.desktopItems.map((i) => i.id),
    ['keyboard'],
  );
  assert.ok(!e.checks.some((c) => ['mouse-mat', 'mount', 'arm'].includes(c.id)));
  assert.deepEqual(
    deskAccessories({ ...s, monitorEnabled: true }).map((item) => item.name),
    ['Desk monitor arm'],
  );
});
test('progress resumes at the exact step and keeps the deferred steps', () => {
  const p = createProject();
  const config = { ...configOf(p), roomEnabled: true, roomW: 410 };
  p.setup = advanceSetup(p.setup);
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup.drafts = { desk: { w: '160', d: '', h: '' } };
  const restored = throughFile(projectFromConfig(config, p.setup));
  assert.equal(restored.setup.step, 'furniture');
  assert.equal(restored.setup.furthest, 2);
  assert.deepEqual(restored.setup.deferred, ['openings']);
  assert.equal(configOf(restored).roomW, 410);
  assert.equal(configOf(restored).deskEnabled, false);
  const deskDraft = present(restored.setup.drafts?.desk, 'desk draft');
  assert.equal(deskDraft.w, '160');
  assert.equal(deskDraft.d, '');
});
test('the v1 adapter keeps the room and the desk, and leaves out the parametric cockpit', () => {
  const old = without({ ...defaults, ...PARAMETRIC_COCKPIT, deskX: 218, cockpitAngle: 70 }, [
    'deskEnabled',
  ]);
  const data = { app: 'Cockpit Lab', version: 1, config: old };
  const p = open(data);
  assert.equal(leftOut(data), true);
  assert.equal(p.cockpit, null);
  assert.equal(p.setup.step, 'complete');
  assert.equal(configOf(p).deskX, 218);
  assert.equal(configOf(p).deskEnabled, true);
  assert.equal(getDesktopItems(configOf(p)).length, 5);
  for (const key of ['length', 'cockpitAngle', 'cockpitEnabled']) assert.ok(!(key in configOf(p)));
  assert.deepEqual(configOf(throughFile(p)), configOf(p));
  assert.equal(open({ version: 1, config: old }, { stored: true }).setup.step, 'complete');
});
test('a v1 file without a desk position puts the desk beside its chassis, as it did', () => {
  const old = without({ ...defaults, width: 70, deskGap: 20 }, ['deskX']);
  assert.equal(configOf(open({ app: 'Cockpit Lab', version: 1, config: old })).deskX, 95);
});
test('the reader rejects inconsistent progress, wrong units and invalid item presence', () => {
  const p = createProject(),
    config = { ...configOf(p), cockpitEnabled: false },
    data = { app: 'Cockpit Lab', version: 2, units: 'cm', config, setup: p.setup };
  assert.throws(() => open({ ...data, units: 'mm' }));
  assert.throws(() => open({ ...data, version: 4 }));
  assert.throws(() => open({ ...data, version: 6 }));
  assert.throws(() => open({ ...data, config: { ...config, deskEnabled: 'false' } }));
  assert.throws(() => open({ ...data, config: { ...configOf(p) } }), /presence/);
  assert.throws(() => open({ ...data, setup: { step: 'desk', furthest: 0, deferred: [] } }));
  assert.throws(() => open({ app: 'Cockpit Lab', version: 1 }));
});
test('a v2 file opens as a single layout called Base, without its parametric cockpit', () => {
  const config = { ...defaults, ...PARAMETRIC_COCKPIT, cockpitEnabled: true, cockpitX: 12 };
  const data = { app: 'Cockpit Lab', version: 2, units: 'cm', config, setup: completeSetup() };
  const p = open(data);
  assert.equal(leftOut(data), true);
  assert.equal(p.cockpit, null);
  assert.equal(p.library.layouts.length, 1);
  assert.equal(p.library.layouts[0].name, 'Base');
  assert.deepEqual(configOf(p), sanitize(config));
  assert.equal(leftOut({ ...data, config: { ...config, cockpitEnabled: false } }), false);
});
test('the summary of a partial project has no geometry of missing items', () => {
  const p = createProject(),
    html = summaryHTML(configOf(p), evaluate(configOf(p)), p.setup);
  assert.ok(html.includes('The room is not set up yet'));
  assert.ok(!html.includes('<h3 class="summary-title">Desk</h3>'));
  assert.ok(!html.includes('Cockpit'));
});
test('the room setup can be finished without a desk, keeping the deferred steps', () => {
  const p = createProject();
  const config = { ...configOf(p), roomEnabled: true };
  p.setup = advanceSetup(p.setup);
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup = advanceSetup(p.setup, { defer: true });
  p.setup = advanceSetup(p.setup, { defer: true });
  const restored = throughFile(projectFromConfig(config, p.setup));
  assert.equal(restored.setup.step, 'complete');
  assert.equal(configOf(restored).deskEnabled, false);
  assert.deepEqual(restored.setup.deferred, ['openings', 'furniture', 'desk']);
});

test('progress saved when the setup had a cockpit step opens without it', () => {
  const config = { ...configOf(createProject()), roomEnabled: true, cockpitEnabled: false };
  const saved = (setup: unknown) =>
    open({ app: 'Cockpit Lab', version: 2, units: 'cm', config, setup }).setup;
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
  const old = open({ app: 'Cockpit Lab', version: 1, config: { ...defaults, roomEnabled: false } });
  const p = throughFile(old);
  assert.equal(configOf(p).roomEnabled, false);
  assert.equal(p.setup.step, 'complete');
  assert.throws(() => open({ app: 'Cockpit Lab', version: 1, units: 'mm', config: defaults }));
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
  const moved = { ...projectConfig(project), deskX: 30, keyboardZ: 5 };
  project = recordProject(project, saveArmPose(moved, 'Racing'));
  return { ...project, library: hideFurniture(project.library, 'bed') };
};

test('a project with several layouts reads back with the same layouts', () => {
  const project = designWithLayouts();
  assert.deepEqual(throughFile(project), { ...project, setup: { ...completeSetup(), drafts: {} } });
});

test('a project is written as v5: the room in cm, and the cockpit design apart from it', () => {
  const file = JSON.parse(JSON.stringify(projectData(designWithLayouts())));
  assert.equal(file.version, 5);
  assert.equal(file.units, 'cm');
  assert.equal(file.cockpit, null);
  assert.deepEqual(Object.keys(file.room).sort(), ['activeLayoutId', 'layouts', 'shared']);
  assert.ok(!('cockpitEnabled' in file.room.shared));
  const withDesign = projectData(replaceCockpitDesign(designWithLayouts(), emptyDesign()));
  assert.deepEqual(withDesign.cockpit, {
    units: 'mm',
    history: [],
    driver: { statureMm: 1750 },
  });
});

test('a v5 project keeps its cockpit design history, and fails loudly on a broken one', () => {
  const project = replaceCockpitDesign(designWithLayouts(), emptyDesign());
  assert.deepEqual(throughFile(project).cockpit, emptyDesign());
  const file = JSON.parse(JSON.stringify(projectData(project)));
  assert.equal(leftOut(file), false);
  assert.throws(() => open({ ...file, cockpit: { units: 'cm', history: [] } }), /units/);
  assert.throws(() => open({ ...file, cockpit: { units: 'mm', history: [{}] } }), /operation/);
  assert.throws(() => open({ ...file, cockpit: 'GT' }), /cockpit design/);
  assert.throws(() => open({ ...file, room: null }), /room/);
});

/** The same project as the v4 writer stored it, with a parametric cockpit the room includes. */
function asVersion4({ library, setup }: Project) {
  return JSON.parse(
    JSON.stringify({
      app: 'Cockpit Lab',
      version: 4,
      units: 'cm',
      cockpit: PARAMETRIC_COCKPIT,
      room: {
        ...library,
        shared: { ...library.shared, cockpitEnabled: true },
        layouts: library.layouts.map((layout) => ({
          ...layout,
          settings: { ...layout.settings, cockpitX: 40, cockpitZ: 0, cockpitAngle: 90 },
        })),
      },
      setup,
    }),
  );
}

test('a v4 file opens with its room and layouts, leaving out the parametric cockpit', () => {
  const project = designWithLayouts();
  const file = asVersion4(project);
  assert.deepEqual(open(file), { ...project, setup: { ...completeSetup(), drafts: {} } });
  assert.equal(leftOut(file), true);
  assert.equal(leftOut({ ...file, cockpit: null }), false);
  assert.throws(() => open({ ...file, cockpit: 'GT' }), /cockpit design/);
});

test('v5 files cannot hold the settings that placed the retired cockpit', () => {
  const file = JSON.parse(JSON.stringify(projectData(designWithLayouts())));
  const layout = { ...file.room.layouts[0], settings: { ...file.room.layouts[0].settings } };
  layout.settings.cockpitX = 10;
  const withLayout = { ...file, room: { ...file.room, layouts: [layout, file.room.layouts[1]] } };
  assert.throws(() => open(withLayout), /cockpitX/);
});

/** The same project as the v3 writer stored it: the cockpit among the shared settings. */
const asVersion3 = ({ library, setup }: Project, cockpitEnabled: boolean) =>
  JSON.parse(
    JSON.stringify({
      app: 'Cockpit Lab',
      version: 3,
      units: 'cm',
      ...library,
      shared: { ...library.shared, ...PARAMETRIC_COCKPIT, cockpitEnabled },
      layouts: library.layouts.map((layout) => ({
        ...layout,
        settings: { ...layout.settings, cockpitX: 40, monitorAhead: 24 },
      })),
      setup,
    }),
  );

test('a v3 file opens with the same layouts, leaving out the parametric cockpit', () => {
  const project = designWithLayouts();
  const restored = open(asVersion3(project, true));
  assert.deepEqual(restored, { ...project, setup: { ...completeSetup(), drafts: {} } });
  assert.equal(leftOut(asVersion3(project, true)), true);
  assert.equal(leftOut(asVersion3(project, false)), false);
  const { cockpitEnabled, ...withoutPresence } = asVersion3(project, true).shared;
  assert.throws(() => open({ ...asVersion3(project, true), shared: withoutPresence }), /presence/);
});

test('the reader rejects layouts that do not match the shared furniture', () => {
  const file = JSON.parse(JSON.stringify(projectData(designWithLayouts())));
  const withRoom = (change: object) => ({ ...file, room: { ...file.room, ...change } });
  const withLayout = (change: object) =>
    withRoom({ layouts: [{ ...file.room.layouts[0], ...change }, file.room.layouts[1]] });
  assert.throws(() => open(withRoom({ layouts: [] })), /layouts/);
  assert.throws(() => open(withLayout({ furniture: {} })), /placement/);
  assert.throws(() => open(withLayout({ hiddenFurniture: ['sofa'] })), /hidden/);
  assert.throws(() => open(withLayout({ id: file.room.layouts[1].id })), /layout id/);
  assert.throws(() => open(withLayout({ settings: { deskX: 'far' } })), /deskX/);
  assert.throws(() => open(withRoom({ activeLayoutId: 'layout-9' })), /active layout/);
  assert.throws(
    () => open(withRoom({ shared: { ...file.room.shared, deskX: 10 } })),
    /Layout setting in the shared settings/,
  );
  const furniture = file.room.shared.roomFurniture;
  assert.throws(
    () =>
      open(
        withRoom({
          shared: { ...file.room.shared, roomFurniture: [...furniture, furniture[0]] },
        }),
      ),
    /furniture/,
  );
});
