import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DRIVER } from '../src/cad/driver.ts';
import type { CockpitDesign } from '../src/cockpit-design.ts';
import { activeLayout, duplicateLayout, layoutConfig } from '../src/layouts.ts';
import { createProject, type Project } from '../src/project.ts';
import type { ProjectStore } from '../src/project-storage.ts';
import { AUTOSAVE_DELAY_MS, ProjectSession, type SaveStatus } from '../src/project-session.ts';
import { railHistory } from './support/designs.ts';
import { present } from './support/lookups.ts';

/** A store that keeps what it saves, or refuses to save when `full`. */
function memoryStore({ full = false } = {}) {
  const saved: Project[] = [];
  const store: ProjectStore = {
    load: () => ({ status: 'empty' }),
    save: (project) => {
      if (full) return false;
      saved.push(structuredClone(project));
      return true;
    },
  };
  return { store, saved };
}

interface SessionSetup {
  /** Whether the store refuses to save. */
  full?: boolean;
  /** The design the cockpit editor has. */
  cockpit?: CockpitDesign | null;
}

function sessionWith({ full = false, cockpit = null }: SessionSetup = {}) {
  const { store, saved } = memoryStore({ full });
  const statuses: [string, SaveStatus][] = [];
  const session = new ProjectSession(createProject(), {
    store,
    cockpit: () => cockpit,
    showStatus: (message, status) => statuses.push([message, status]),
  });
  return { session, saved, statuses };
}

const lastSaved = (saved: readonly Project[]) => present(saved.at(-1), 'a saved project');

test('the open project records the active layout as it is being edited', () => {
  const { session } = sessionWith();
  session.state = { ...session.state, roomW: 412 };
  assert.equal(layoutConfig(session.recorded().library).roomW, 412);
});

test('the open project takes the cockpit design from the cockpit editor', () => {
  const cockpit = { history: railHistory(), driver: DEFAULT_DRIVER };
  const { session } = sessionWith({ cockpit });
  assert.equal(session.recorded().cockpit, cockpit);
});

test('saving soon waits for more changes, then saves once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, saved, statuses } = sessionWith();
  session.saveSoon();
  session.state = { ...session.state, roomW: 380 };
  session.saveSoon();
  assert.deepEqual(statuses.at(-1), ['Saving…', 'ok']);
  assert.equal(saved.length, 0);
  t.mock.timers.tick(AUTOSAVE_DELAY_MS);
  assert.equal(saved.length, 1);
  assert.equal(layoutConfig(lastSaved(saved).library).roomW, 380);
  assert.deepEqual(statuses.at(-1), ['Saved in this browser', 'ok']);
});

test('saving now drops the save that was waiting', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { session, saved } = sessionWith();
  session.saveSoon();
  session.saveNow();
  t.mock.timers.tick(AUTOSAVE_DELAY_MS);
  assert.equal(saved.length, 1);
});

test('a browser that cannot save says so', () => {
  const { session, statuses } = sessionWith({ full: true });
  session.saveNow();
  assert.deepEqual(statuses.at(-1), ['Not saved automatically · export a JSON file', 'error']);
});

test('changing the layouts keeps the edits, opens the new active layout and saves', () => {
  const { session, saved } = sessionWith();
  session.state = { ...session.state, roomW: 333 };
  session.changeLayouts((library) => duplicateLayout(library, 'Copy'));
  assert.equal(activeLayout(session.library).name, 'Copy');
  assert.equal(session.state.roomW, 333);
  assert.equal(session.library.layouts.length, 2);
  assert.equal(lastSaved(saved).library.layouts.length, 2);
});

test('opening a project edits its active layout and its setup', () => {
  const { session } = sessionWith();
  const other = createProject();
  const project: Project = {
    ...other,
    setup: { ...other.setup, step: 'complete' },
  };
  session.state = { ...session.state, roomW: 999 };
  session.open(project);
  assert.equal(session.setup.step, 'complete');
  assert.deepEqual(session.state, layoutConfig(project.library));
});
