import test from 'node:test';
import assert from 'node:assert/strict';
import { rigPanelHTML, bodyPanelHTML, deskPanelHTML } from '../src/settings-panels.ts';
import { defaults, evaluate } from '../src/model.ts';

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
