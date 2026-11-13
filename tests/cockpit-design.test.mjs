import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate, presets } from '../src/model.ts';
import {
  COCKPIT_DESIGN_KEYS,
  designOf,
  designOnItsOwn,
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
  assert.equal(room.cockpitEnabled, true);
  assert.equal(room.roomW, 330);
  assert.deepEqual(placeCockpit(room, cockpit), config);
});

test('a room that leaves the cockpit out places none, and the design is still there', () => {
  const config = { ...defaults, cockpitEnabled: false, height: 190 };
  assert.equal(designOf(config).height, 190);
  const { room } = splitCockpit(config);
  assert.equal(room.cockpitEnabled, false);
  const placed = placeCockpit(room, designOf(config));
  assert.equal(placed.cockpitEnabled, false);
  assert.equal(placed.height, 190);
  assert.equal(placeCockpit({ ...room, cockpitEnabled: true }, null).cockpitEnabled, false);
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

test('a design on its own stands at the origin, with no room, desk or monitor around it', () => {
  const placed = { ...defaults, height: 186, recline: 24, cockpitX: 140, cockpitAngle: 90 };
  const { cockpit } = splitCockpit(placed);
  const alone = designOnItsOwn(cockpit);
  assert.deepEqual(splitCockpit(alone).cockpit, cockpit);
  assert.equal(alone.cockpitEnabled, true);
  assert.deepEqual([alone.cockpitX, alone.cockpitZ, alone.cockpitAngle], [0, 0, 0]);
  assert.equal(alone.roomEnabled, false);
  assert.equal(alone.deskEnabled, false);
  assert.equal(alone.monitorEnabled, false);
  // The posture depends on the design alone, wherever the cockpit stands; the screen belongs to
  // the room, so the distance to it is only checked there.
  const withoutScreen = (config) => evaluate(config).bodyCheck.filter((c) => c.id !== 'eyes');
  assert.deepEqual(evaluate(alone).bodyCheck, withoutScreen(placed));
});

test('without a design there is nothing to show on its own', () => {
  const alone = designOnItsOwn(null);
  assert.equal(alone.cockpitEnabled, false);
  assert.equal(alone.roomEnabled, false);
  assert.equal(alone.deskEnabled, false);
});
