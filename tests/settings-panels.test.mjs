import test from 'node:test';
import assert from 'node:assert/strict';
import { rigPanelHTML, bodyPanelHTML, deskPanelHTML } from '../src/settings-panels.ts';
import { defaults, evaluate } from '../src/model.ts';
import { saveArmPose, applyArmPose } from '../src/arm-poses.ts';

const viewOf = (overrides = {}) => {
  const state = { ...defaults, ...overrides };
  return { state, evaluation: evaluate(state) };
};
const keysIn = (html) => [...html.matchAll(/id="([a-zA-Z]+)-range"/g)].map((match) => match[1]);

test('the rig panel sets the base, its elevation and the modules', () => {
  const html = rigPanelHTML(viewOf());
  for (const key of ['cockpitX', 'cockpitZ', 'cockpitAngle', 'length', 'width', 'baseLift'])
    assert.ok(keysIn(html).includes(key), key);
  for (const key of ['wheel', 'hotas', 'centerStick', 'shifter', 'handbrake'])
    assert.match(html, new RegExp(`type="checkbox" id="${key}"`));
  assert.match(html, /<select id="drivingSide"/);
  assert.match(html, /<select id="feet"/);
  assert.match(html, /id="bodySettings"/);
});

test('the posture panel shows only the controls of the mounted modules', () => {
  const bare = keysIn(
    bodyPanelHTML(
      viewOf({ wheel: false, hotas: false, shifter: false, handbrake: false, centerStick: false }),
    ),
  );
  assert.deepEqual(bare, ['height', 'seatZ', 'seatH', 'recline', 'pedalZ', 'pedalH', 'pedalTilt']);
  const full = keysIn(bodyPanelHTML(viewOf({ wheel: true, hotas: true, centerStick: true })));
  for (const key of [
    'wheelZ',
    'wheelH',
    'wheelTilt',
    'hotasZ',
    'hotasH',
    'hotasOut',
    'stickZ',
    'stickH',
  ])
    assert.ok(full.includes(key), key);
});

test('the desk panel includes the monitor arm only when there is a monitor', () => {
  const withMonitor = deskPanelHTML(viewOf(), 'desk');
  assert.match(withMonitor, /<div class="control-group" id="armControls">/);
  assert.ok(keysIn(withMonitor).includes('armReach'));
  const without = deskPanelHTML(viewOf({ monitorEnabled: false }), 'desk');
  assert.doesNotMatch(without, /id="armControls"/);
  assert.ok(!keysIn(without).includes('armReach'));
});

test('the desk panel marks the current tabletop size and offers layouts next to the cockpit', () => {
  const html = deskPanelHTML(viewOf({ deskWidth: 160, deskDepth: 80 }), 'desk');
  assert.match(html, /<option value="160x80" selected>160 × 80 cm<\/option>/);
  assert.match(html, /id="layoutPreset"/);
  assert.doesNotMatch(
    deskPanelHTML(viewOf({ cockpitEnabled: false }), 'desk'),
    /id="layoutPreset"/,
  );
});

test('the desk panel lists the saved arm poses instead of the automatic shortcuts', () => {
  let state = saveArmPose(saveArmPose(defaults, 'Racing'), 'Desk <2>');
  state = applyArmPose(state, 'pose-1');
  const html = deskPanelHTML({ state, evaluation: evaluate(state) }, 'desk');
  assert.doesNotMatch(html, /data-monitor-pose/);
  assert.match(
    html,
    /<button[^>]*data-arm-pose="pose-1"[^>]*aria-pressed="true"[^>]*>Racing<\/button>/,
  );
  assert.match(
    html,
    /<button[^>]*data-arm-pose="pose-2"[^>]*aria-pressed="false"[^>]*>Desk 2<\/button>/,
  );
  assert.match(html, /data-delete-arm-pose="pose-1" aria-label="Delete the pose Racing"/);
  assert.match(html, /<input[^>]*id="armPoseName"[^>]*maxlength="40"/);
  assert.match(html, /<button[^>]*id="saveArmPose"/);
  assert.doesNotMatch(html, /data-mount-moved/);
});

test('without saved poses the desk panel explains how to save one', () => {
  const html = deskPanelHTML(viewOf(), 'desk');
  assert.doesNotMatch(html, /data-arm-pose=/);
  assert.match(html, /id="armPoseHint"/);
});

test('a pose saved with the arm mounted elsewhere says so in text', () => {
  const state = { ...saveArmPose(defaults, 'Racing'), clampX: defaults.clampX + 10 };
  const html = deskPanelHTML({ state, evaluation: evaluate(state) }, 'desk');
  assert.match(
    html,
    /<small data-mount-moved="pose-1">Saved with the arm mounted elsewhere<\/small>/,
  );
});
