import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStore, STORAGE_KEY, LEGACY_STORAGE_KEYS } from '../src/project-storage.ts';
import {
  createProject,
  completeSetup,
  projectData,
  projectConfig,
  projectFromConfig,
} from '../src/project.ts';
import { defaults, sanitize } from '../src/model.ts';

const [V4_STORAGE_KEY, V3_STORAGE_KEY, V2_STORAGE_KEY, V1_STORAGE_KEY] = LEGACY_STORAGE_KEYS;

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
  assert.deepEqual(store.load(), {
    status: 'loaded',
    project: asLoaded(project),
    parametricCockpitLeftOut: false,
  });
});

test('the project is saved as a v5 file under the current key', () => {
  const storage = memoryStorage();
  createProjectStore(() => storage).save(createProject());
  const saved = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.equal(STORAGE_KEY, 'cockpit-lab-v5');
  assert.deepEqual(LEGACY_STORAGE_KEYS, [
    'cockpit-lab-v4',
    'cockpit-lab-v3',
    'cockpit-lab-v2',
    'cockpit-lab-v1',
  ]);
  assert.equal(saved.app, 'Cockpit Lab');
  assert.equal(saved.version, 5);
  assert.equal(saved.units, 'cm');
});

test('rooms saved by earlier versions are recovered from their keys, without their cockpit', () => {
  const v1 = { version: 1, units: 'cm', config: { ...defaults, deskH: 70 } };
  const v2 = {
    app: 'Cockpit Lab',
    version: 2,
    units: 'cm',
    config: { ...defaults, deskH: 71, cockpitEnabled: true },
    setup: completeSetup(),
  };
  const current = projectData(
    projectFromConfig(sanitize({ ...defaults, deskH: 72 }), completeSetup()),
  );
  // As the v3 writer stored it: the parametric cockpit among the room's shared settings.
  const v3 = {
    ...current,
    ...current.room,
    version: 3,
    shared: { ...current.room.shared, seatH: 32, cockpitEnabled: true },
  };
  delete v3.room;
  delete v3.cockpit;
  const v4 = {
    ...current,
    version: 4,
    cockpit: { seatH: 32 },
    room: { ...current.room, shared: { ...current.room.shared, deskH: 73 } },
  };
  for (const [key, file, deskH] of [
    [V1_STORAGE_KEY, v1, 70],
    [V2_STORAGE_KEY, v2, 71],
    [V3_STORAGE_KEY, v3, 72],
    [V4_STORAGE_KEY, v4, 73],
  ]) {
    const result = createProjectStore(() => memoryStorage({ [key]: JSON.stringify(file) })).load();
    assert.equal(result.status, 'loaded', key);
    assert.equal(projectConfig(result.project).deskH, deskH, key);
    assert.equal(result.project.cockpit, null, key);
    assert.equal(result.parametricCockpitLeftOut, true, key);
    assert.equal(result.project.setup.step, 'complete', key);
  }
});

test('the first save over a v4 project leaves the v4 copy untouched', () => {
  const v4 = JSON.stringify({
    ...projectData({ ...createProject(), setup: completeSetup() }),
    version: 4,
    cockpit: { seatH: 32 },
  });
  const storage = memoryStorage({ [V4_STORAGE_KEY]: v4 });
  const store = createProjectStore(() => storage);
  const loaded = store.load();
  assert.equal(loaded.status, 'loaded');
  assert.equal(store.save(loaded.project), true);
  assert.equal(storage.data.get(V4_STORAGE_KEY), v4);
  assert.equal(JSON.parse(storage.data.get(STORAGE_KEY)).version, 5);
  const reloaded = createProjectStore(() => storage).load();
  assert.equal(reloaded.parametricCockpitLeftOut, false);
});

test('the newest key takes precedence and older keys are left untouched', () => {
  const current = createProject();
  const v1 = JSON.stringify({ version: 1, config: { ...defaults, deskH: 70 } });
  const storage = memoryStorage({ [V1_STORAGE_KEY]: v1 });
  createProjectStore(() => storage).save(current);
  assert.deepEqual(createProjectStore(() => storage).load(), {
    status: 'loaded',
    project: asLoaded(current),
    parametricCockpitLeftOut: false,
  });
  assert.equal(storage.data.get(V1_STORAGE_KEY), v1);
});

const NOW = new Date('2026-11-12T16:52:03.120Z');
const BACKUP_KEY = 'cockpit-lab-unreadable-2026-11-12T16-52-03-120Z';
const storeAt = (storage) => createProjectStore(() => storage, { now: () => NOW });

test('an unreadable save is set aside before anything is saved over it', () => {
  for (const text of ['{not json', JSON.stringify({ version: 9, config: {} })]) {
    const storage = memoryStorage({ [STORAGE_KEY]: text });
    const store = storeAt(storage);
    assert.deepEqual(store.load(), { status: 'unreadable', keptAs: BACKUP_KEY, text });
    assert.equal(store.save(createProject()), true);
    assert.equal(storage.data.get(BACKUP_KEY), text);
    assert.equal(store.load().status, 'loaded');
  }
});

test('a save the reader rejects is kept, as when a layout setting sat among the shared ones', () => {
  const file = projectData({ ...createProject(), setup: completeSetup() });
  const room = { ...file.room, shared: { ...file.room.shared, armPoses: [] } };
  const misplaced = JSON.stringify({ ...file, room });
  const storage = memoryStorage({ [STORAGE_KEY]: misplaced });
  const store = storeAt(storage);
  assert.equal(store.load().status, 'unreadable');
  store.save(createProject());
  assert.equal(storage.data.get(BACKUP_KEY), misplaced);
});

test('when the unreadable save cannot be copied, automatic saving pauses instead of overwriting it', () => {
  const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
  // Full storage: a new key fails, but overwriting the current one would still succeed.
  const full = {
    getItem: storage.getItem,
    setItem: (key, value) => {
      if (key !== STORAGE_KEY) throw new Error('QuotaExceededError');
      storage.setItem(key, value);
    },
  };
  const store = createProjectStore(() => full, { now: () => NOW });
  assert.deepEqual(store.load(), { status: 'unreadable', keptAs: STORAGE_KEY, text: '{not json' });
  assert.equal(store.save(createProject()), false);
  assert.equal(storage.data.get(STORAGE_KEY), '{not json');
});

test('an unreadable save from an earlier version stays under its own key', () => {
  const storage = memoryStorage({ [V2_STORAGE_KEY]: '{not json' });
  const store = storeAt(storage);
  assert.deepEqual(store.load(), {
    status: 'unreadable',
    keptAs: V2_STORAGE_KEY,
    text: '{not json',
  });
  assert.equal(store.save(createProject()), true);
  assert.equal(storage.data.get(V2_STORAGE_KEY), '{not json');
  assert.equal(storage.data.has(BACKUP_KEY), false);
});

test('a blocked storage is reported on load and save', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  assert.deepEqual(createProjectStore(blocked).load(), { status: 'unavailable' });
  assert.equal(createProjectStore(blocked).save(createProject()), false);
  const full = { getItem: () => null, setItem: () => blocked() };
  assert.equal(createProjectStore(() => full).save(createProject()), false);
});
