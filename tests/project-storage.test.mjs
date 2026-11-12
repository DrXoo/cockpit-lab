import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, STORAGE_KEY, LEGACY_STORAGE_KEYS } from '../src/project-storage.ts';
import { createProject, completeSetup } from '../src/project.ts';
import { layoutConfig } from '../src/layouts.ts';
import { defaults } from '../src/model.ts';

const [V2_STORAGE_KEY, V1_STORAGE_KEY] = LEGACY_STORAGE_KEYS;

function memoryStorage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

test('an empty browser storage has no project', () => {
  assert.deepEqual(createProjectStore(() => memoryStorage()).load(), { status: 'empty' });
});

// Reading a file always yields a drafts object, empty when there were none.
const asLoaded = (project) => ({ ...project, setup: { drafts: {}, ...project.setup } });

test('a saved project loads back unchanged', () => {
  const storage = memoryStorage();
  const store = createProjectStore(() => storage);
  const project = createProject();
  assert.equal(store.save(project), true);
  assert.deepEqual(store.load(), { status: 'loaded', project: asLoaded(project) });
});

test('the project is saved as a v3 file under the current key', () => {
  const storage = memoryStorage();
  createProjectStore(() => storage).save(createProject());
  const saved = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.equal(STORAGE_KEY, 'cockpit-lab-v3');
  assert.equal(saved.app, 'Cockpit Lab');
  assert.equal(saved.version, 3);
  assert.equal(saved.units, 'cm');
});

test('designs saved by earlier versions are recovered from their keys', () => {
  const v1 = { version: 1, units: 'cm', config: { ...defaults, seatH: 30 } };
  const v2 = {
    app: 'Cockpit Lab',
    version: 2,
    units: 'cm',
    config: { ...defaults, seatH: 31 },
    setup: completeSetup(),
  };
  for (const [key, file, seatH] of [
    [V1_STORAGE_KEY, v1, 30],
    [V2_STORAGE_KEY, v2, 31],
  ]) {
    const result = createProjectStore(() => memoryStorage({ [key]: JSON.stringify(file) })).load();
    assert.equal(result.status, 'loaded');
    assert.equal(layoutConfig(result.project.library).seatH, seatH);
    assert.equal(result.project.setup.step, 'complete');
  }
});

test('the newest key takes precedence and older keys are left untouched', () => {
  const current = createProject();
  const v1 = JSON.stringify({ version: 1, config: { ...defaults, seatH: 30 } });
  const storage = memoryStorage({ [V1_STORAGE_KEY]: v1 });
  createProjectStore(() => storage).save(current);
  assert.deepEqual(createProjectStore(() => storage).load(), {
    status: 'loaded',
    project: asLoaded(current),
  });
  assert.equal(storage.data.get(V1_STORAGE_KEY), v1);
});

test('unreadable or invalid saved data is reported, not thrown', () => {
  for (const text of ['{not json', JSON.stringify({ version: 9, config: {} })])
    assert.deepEqual(createProjectStore(() => memoryStorage({ [STORAGE_KEY]: text })).load(), {
      status: 'invalid',
    });
});

test('a blocked storage is reported on load and save', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  assert.deepEqual(createProjectStore(blocked).load(), { status: 'invalid' });
  assert.equal(createProjectStore(blocked).save(createProject()), false);
  const full = { getItem: () => null, setItem: () => blocked() };
  assert.equal(createProjectStore(() => full).save(createProject()), false);
});
