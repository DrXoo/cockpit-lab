import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sectionOfStep,
  setupButtons,
  nextSetupStep,
  withRoomSize,
  withDesk,
  withCockpitPreset,
} from '../src/setup-actions.ts';
import { createProject } from '../src/project.ts';
import { layoutConfig } from '../src/layouts.ts';
import { presets } from '../src/model.ts';

const fresh = createProject();
const freshConfig = layoutConfig(fresh.library);
const atStep = (step, furthest = 4) => ({ step, furthest, deferred: [] });
const withRoom = withRoomSize(freshConfig, 300, 400, 250);

test('each step opens its settings section', () => {
  assert.equal(sectionOfStep('room'), 'room');
  assert.equal(sectionOfStep('openings'), 'room');
  assert.equal(sectionOfStep('furniture'), 'room');
  assert.equal(sectionOfStep('desk'), 'desk');
  assert.equal(sectionOfStep('cockpit'), 'rig');
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

test('the cockpit preset is applied and the rig centred along the room', () => {
  const state = withCockpitPreset(withRoom, 'flight');
  assert.equal(state.cockpitEnabled, true);
  assert.equal(state.preset, 'flight');
  assert.equal(state.hotas, presets.flight.values.hotas);
  assert.equal(state.cockpitX, 150);
  assert.equal(state.cockpitZ, (400 - presets.flight.values.length) / 2);
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
  const cockpit = setupButtons(atStep('cockpit'), withCockpitPreset(withRoom, 'gt'));
  assert.equal(cockpit.nextLabel, 'Finish');
  assert.equal(cockpit.nextDisabled, false);
  assert.equal(cockpit.skipHidden, true);
});

test('the room must be defined before continuing', () => {
  assert.deepEqual(nextSetupStep(atStep('room', 0), freshConfig), { status: 'needs-room' });
});

test('the desk and the cockpit steps need their element unless skipped', () => {
  assert.deepEqual(nextSetupStep(atStep('desk', 3), withRoom), { status: 'blocked' });
  const skipped = nextSetupStep(atStep('desk', 3), withRoom, { defer: true });
  assert.equal(skipped.status, 'advanced');
  assert.deepEqual(skipped.setup, { step: 'cockpit', furthest: 4, deferred: ['desk'] });
});

test('an openings or furniture step without items is kept to revisit', () => {
  const result = nextSetupStep(atStep('openings', 1), withRoom);
  assert.deepEqual(result, {
    status: 'advanced',
    setup: { step: 'furniture', furthest: 2, deferred: ['openings'] },
  });
});
