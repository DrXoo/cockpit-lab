import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize } from '../src/model.ts';
import { COCKPIT_DESIGN_KEYS, designFromBase, designOf } from '../src/cockpit-design.ts';
import { cockpitFileData, readCockpitFile } from '../src/cockpit-file.ts';
import {
  completeSetup,
  projectConfig,
  projectFromConfig,
  recordProject,
  replaceCockpitDesign,
} from '../src/project.ts';
import { duplicateLayout, leaveOutCockpit } from '../src/layouts.ts';

const design = { ...designFromBase('flight'), height: 186, baseLift: 12 };
/** A cockpit file through JSON, as it is downloaded and opened again. */
const file = () => JSON.parse(JSON.stringify(cockpitFileData(design)));

test('a cockpit file carries the design alone, in cm, and reads back the same', () => {
  const data = file();
  assert.deepEqual(
    { app: data.app, kind: data.kind, version: data.version, units: data.units },
    { app: 'Cockpit Lab', kind: 'cockpit', version: 1, units: 'cm' },
  );
  assert.deepEqual(Object.keys(data.cockpit).sort(), [...COCKPIT_DESIGN_KEYS].sort());
  assert.deepEqual(readCockpitFile(data), design);
});

test('a cockpit file is rejected when it is something else or incomplete', () => {
  const data = file();
  const withCockpit = (change) => ({ ...data, cockpit: { ...data.cockpit, ...change } });
  assert.throws(() => readCockpitFile({ ...data, app: 'Other' }), /another program/);
  assert.throws(
    () => readCockpitFile({ app: 'Cockpit Lab', version: 4, units: 'cm', cockpit: data.cockpit }),
    /not a cockpit file/,
  );
  assert.throws(() => readCockpitFile({ ...data, version: 2 }), /version/);
  assert.throws(() => readCockpitFile({ ...data, units: 'mm' }), /units/);
  assert.throws(() => readCockpitFile(withCockpit({ roomW: 300 })), /roomW/);
  assert.throws(() => readCockpitFile(withCockpit({ length: 'long' })), /length/);
  assert.throws(() => readCockpitFile(withCockpit({ feet: 'wheels' })), /feet/);
  const { seatH, ...withoutSeat } = data.cockpit;
  assert.throws(() => readCockpitFile({ ...data, cockpit: withoutSeat }), /seatH/);
});

const twoLayouts = (config) => {
  const base = projectFromConfig(sanitize(config), completeSetup());
  return { ...base, library: duplicateLayout(base.library, 'Second') };
};

test('importing a design replaces the project one, in every layout that places it', () => {
  const project = twoLayouts({ ...defaults, cockpitX: 40 });
  const replaced = replaceCockpitDesign(project, design);
  assert.deepEqual(replaced.cockpit, design);
  for (const layout of ['layout-1', 'layout-2']) {
    const config = projectConfig(replaced, layout);
    assert.equal(config.cockpitEnabled, true, layout);
    assert.deepEqual(designOf(config), design, layout);
    assert.equal(config.cockpitX, 40, layout);
  }
});

test('an imported design does not join a room that leaves the cockpit out', () => {
  const project = twoLayouts({ ...defaults, cockpitEnabled: false });
  const replaced = replaceCockpitDesign(project, design);
  assert.deepEqual(replaced.cockpit, design);
  assert.equal(projectConfig(replaced).cockpitEnabled, false);
  const leftOut = { ...twoLayouts(defaults) };
  const kept = replaceCockpitDesign(
    { ...leftOut, library: leaveOutCockpit(leftOut.library) },
    design,
  );
  assert.equal(projectConfig(kept).cockpitEnabled, false);
  // Recording the room afterwards keeps the imported design.
  assert.deepEqual(recordProject(kept, projectConfig(kept)).cockpit, design);
});
