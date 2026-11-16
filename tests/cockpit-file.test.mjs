import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize } from '../src/model.ts';
import { emptyDesign } from '../src/cockpit-design.ts';
import {
  cockpitFileData,
  PARAMETRIC_COCKPIT_FILE_MESSAGE,
  readCockpitFile,
} from '../src/cockpit-file.ts';
import {
  completeSetup,
  projectConfig,
  projectFromConfig,
  recordProject,
  replaceCockpitDesign,
} from '../src/project.ts';

const design = emptyDesign();
/** A cockpit file through JSON, as it is downloaded and opened again. */
const file = () => JSON.parse(JSON.stringify(cockpitFileData(design)));

test('a cockpit file carries the design history alone, in mm, and reads back the same', () => {
  assert.deepEqual(file(), {
    app: 'Cockpit Lab',
    kind: 'cockpit',
    version: 2,
    cockpit: { units: 'mm', history: [] },
  });
  assert.deepEqual(readCockpitFile(file()), design);
});

test('a cockpit file is rejected when it is something else or holds an unusable design', () => {
  const data = file();
  assert.throws(() => readCockpitFile({ ...data, app: 'Other' }), /another program/);
  assert.throws(
    () => readCockpitFile({ app: 'Cockpit Lab', version: 5, units: 'cm', cockpit: null }),
    /not a cockpit file/,
  );
  assert.throws(() => readCockpitFile({ ...data, version: 3 }), /version/);
  assert.throws(() => readCockpitFile({ ...data, cockpit: { history: [] } }), /units/);
  assert.throws(
    () => readCockpitFile({ ...data, cockpit: { units: 'mm', history: [{ kind: 'x' }] } }),
    /Unknown operation/,
  );
});

test('a version 1 cockpit file holds a retired parametric cockpit and is rejected', () => {
  const version1 = {
    app: 'Cockpit Lab',
    kind: 'cockpit',
    version: 1,
    units: 'cm',
    cockpit: { length: 145, width: 64, preset: 'gt' },
  };
  assert.throws(() => readCockpitFile(version1), { message: PARAMETRIC_COCKPIT_FILE_MESSAGE });
});

test('importing a design replaces the project one and leaves the room as it was', () => {
  const project = projectFromConfig(sanitize(defaults), completeSetup());
  const replaced = replaceCockpitDesign(project, design);
  assert.deepEqual(replaced.cockpit, design);
  assert.deepEqual(replaced.library, project.library);
  // Recording the room afterwards keeps the imported design.
  assert.deepEqual(recordProject(replaced, projectConfig(replaced)).cockpit, design);
});
