import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, STORAGE_KEY, LEGACY_STORAGE_KEY } from '../src/project-storage.ts';
import { createProject, completeSetup } from '../src/project.ts';
import { defaults } from '../src/model.ts';

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

// Reading a v2 file always yields a drafts object, empty when there were none.
const asLoaded = (project) => ({ ...project, setup: { drafts: {}, ...project.setup } });

test('a saved project loads back unchanged', () => {
  const storage = memoryStorage();
  const store = createProjectStore(() => storage);
  const project = createProject();
  assert.equal(store.save(project), true);
  assert.deepEqual(store.load(), { status: 'loaded', project: asLoaded(project) });
});

test('the project is saved as a v2 file under the current key', () => {
  const storage = memoryStorage();
  createProjectStore(() => storage).save(createProject());
  const saved = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.equal(saved.app, 'Cockpit Lab');
  assert.equal(saved.version, 2);
  assert.equal(saved.units, 'cm');
});

test('a design saved by the previous version is recovered from the legacy key', () => {
  const legacy = { version: 1, units: 'cm', config: { ...defaults, seatH: 30 } };
  const store = createProjectStore(() =>
    memoryStorage({ [LEGACY_STORAGE_KEY]: JSON.stringify(legacy) }),
  );
  const result = store.load();
  assert.equal(result.status, 'loaded');
  assert.equal(result.project.config.seatH, 30);
  assert.deepEqual(result.project.setup, completeSetup());
});

test('the current key takes precedence over the legacy one', () => {
  const current = createProject();
  const storage = memoryStorage({
    [LEGACY_STORAGE_KEY]: JSON.stringify({ version: 1, config: { ...defaults, seatH: 30 } }),
  });
  createProjectStore(() => storage).save(current);
  assert.deepEqual(createProjectStore(() => storage).load(), {
    status: 'loaded',
    project: asLoaded(current),
  });
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
