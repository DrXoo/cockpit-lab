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

const [V3_STORAGE_KEY, V2_STORAGE_KEY, V1_STORAGE_KEY] = LEGACY_STORAGE_KEYS;

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

test('the project is saved as a v4 file under the current key', () => {
  const storage = memoryStorage();
  createProjectStore(() => storage).save(createProject());
  const saved = JSON.parse(storage.data.get(STORAGE_KEY));
  assert.equal(STORAGE_KEY, 'cockpit-lab-v4');
  assert.deepEqual(LEGACY_STORAGE_KEYS, ['cockpit-lab-v3', 'cockpit-lab-v2', 'cockpit-lab-v1']);
  assert.equal(saved.app, 'Cockpit Lab');
  assert.equal(saved.version, 4);
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
  // As the v3 writer stored it: the cockpit design among the room's shared settings.
  const current = projectData(
    projectFromConfig(sanitize({ ...defaults, seatH: 32 }), completeSetup()),
  );
  const v3 = {
    ...current,
    ...current.room,
    version: 3,
    shared: { ...current.room.shared, ...current.cockpit, cockpitEnabled: true },
  };
  delete v3.room;
  delete v3.cockpit;
  for (const [key, file, seatH] of [
    [V1_STORAGE_KEY, v1, 30],
    [V2_STORAGE_KEY, v2, 31],
    [V3_STORAGE_KEY, v3, 32],
  ]) {
    const result = createProjectStore(() => memoryStorage({ [key]: JSON.stringify(file) })).load();
    assert.equal(result.status, 'loaded');
    assert.equal(projectConfig(result.project).seatH, seatH);
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
