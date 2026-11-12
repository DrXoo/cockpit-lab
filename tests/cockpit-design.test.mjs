import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, presets } from '../src/model.ts';
import {
  COCKPIT_DESIGN_KEYS,
  isCockpitDesignSetting,
  placeCockpit,
  splitCockpit,
} from '../src/cockpit-design.ts';

test('a configuration splits into the cockpit design and the room, and back', () => {
  const config = { ...defaults, height: 185, baseLift: 12, roomW: 330, deskX: 40 };
  const { cockpit, room } = splitCockpit(config);
  assert.equal(cockpit.height, 185);
  assert.equal(cockpit.baseLift, 12);
  assert.equal('roomW' in cockpit, false);
  assert.equal('height' in room, false);
  assert.equal('cockpitEnabled' in room, false);
  assert.equal(room.roomW, 330);
  assert.deepEqual(placeCockpit(room, cockpit), config);
});

test('without a cockpit there is no design, and placing none leaves the cockpit out', () => {
  const { cockpit, room } = splitCockpit({ ...defaults, cockpitEnabled: false, height: 190 });
  assert.equal(cockpit, null);
  const config = placeCockpit(room, null);
  assert.equal(config.cockpitEnabled, false);
  assert.equal(config.height, defaults.height);
});

test('the design is the frame, the driver and the controls, and what a base sets', () => {
  for (const key of ['length', 'width', 'baseLift', 'height', 'seatZ', 'wheel', 'drivingSide'])
    assert.ok(isCockpitDesignSetting(key), key);
  for (const key of [
    'cockpitX',
    'cockpitAngle',
    'deskH',
    'roomW',
    'monitorAhead',
    'cockpitEnabled',
  ])
    assert.equal(isCockpitDesignSetting(key), false, key);
  for (const key of Object.keys(presets.gt.values))
    assert.ok(COCKPIT_DESIGN_KEYS.includes(key), `preset value ${key}`);
});
