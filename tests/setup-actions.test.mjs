import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionOfStep,
  setupButtons,
  nextSetupStep,
  withRoomSize,
  withDesk,
} from '../src/setup-actions.ts';
import { createProject, projectConfig, steps } from '../src/project.ts';

const fresh = createProject();
const freshConfig = projectConfig(fresh);
const atStep = (step, furthest = 3) => ({ step, furthest, deferred: [] });
const withRoom = withRoomSize(freshConfig, 300, 400, 250);

test('the room setup has four steps and does not design a cockpit', () => {
  assert.deepEqual(
    steps.map((step) => step.id),
    ['room', 'openings', 'furniture', 'desk'],
  );
});

test('each step opens its settings section', () => {
  assert.equal(sectionOfStep('room'), 'room');
  assert.equal(sectionOfStep('openings'), 'room');
  assert.equal(sectionOfStep('furniture'), 'room');
  assert.equal(sectionOfStep('desk'), 'desk');
});

test('the room size enables and validates the room', () => {
  assert.equal(withRoom.roomEnabled, true);
  assert.deepEqual([withRoom.roomW, withRoom.roomD, withRoom.roomH], [300, 400, 250]);
  assert.equal(withRoomSize(freshConfig, 300, 400, 9999).roomH, 400);
});

test('the desk is added in the middle of the room with the monitor on it', () => {
  const state = withDesk(withRoom, 140, 70, 75);
  assert.equal(state.deskEnabled, true);
  assert.deepEqual([state.deskWidth, state.deskDepth, state.deskH], [140, 70, 75]);
  assert.deepEqual([state.deskX, state.deskZ], [150, 200]);
  assert.equal(state.monitorMode, 'desk');
});

test('the step buttons follow what has been added', () => {
  assert.deepEqual(setupButtons(atStep('room'), freshConfig), {
    backDisabled: true,
    nextLabel: 'Continue',
    nextDisabled: false,
    skipHidden: true,
    skipLabel: 'Add later',
  });
  assert.equal(setupButtons(atStep('openings'), withRoom).skipHidden, false);
  assert.deepEqual(
    (({ nextDisabled, skipHidden, skipLabel }) => ({ nextDisabled, skipHidden, skipLabel }))(
      setupButtons(atStep('desk'), withRoom),
    ),
    { nextDisabled: true, skipHidden: false, skipLabel: "I don't need a desk" },
  );
  const desk = setupButtons(atStep('desk'), withDesk(withRoom, 140, 70, 75));
  assert.equal(desk.nextLabel, 'Finish');
  assert.equal(desk.nextDisabled, false);
  assert.equal(desk.skipHidden, true);
});

test('the room must be defined before continuing', () => {
  assert.deepEqual(nextSetupStep(atStep('room', 0), freshConfig), { status: 'needs-room' });
});

test('the desk step, the last one, needs a desk unless skipped', () => {
  assert.deepEqual(nextSetupStep(atStep('desk', 3), withRoom), { status: 'blocked' });
  const skipped = nextSetupStep(atStep('desk', 3), withRoom, { defer: true });
  assert.equal(skipped.status, 'advanced');
  assert.deepEqual(skipped.setup, { step: 'complete', furthest: 3, deferred: ['desk'] });
});

test('an openings or furniture step without items is kept to revisit', () => {
  const result = nextSetupStep(atStep('openings', 1), withRoom);
  assert.deepEqual(result, {
    status: 'advanced',
    setup: { step: 'furniture', furthest: 2, deferred: ['openings'] },
  });
});
