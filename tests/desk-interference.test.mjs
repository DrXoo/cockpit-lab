import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate } from '../src/model.ts';
import { describeInterference } from '../src/interference.ts';

const COCKPIT_PARTS = [
  'Cockpit frame',
  'Cockpit seat',
  'Pedals',
  'Wheel',
  'Wheel stand',
  'Joystick',
  'Throttle',
  'Shifter and handbrake',
  'Center stick',
  'Base extension',
];
const DESK_PARTS = ['Desktop', 'Desk column', 'Desk foot'];

const nearDesk = {
  ...defaults,
  deskX: 60,
  deskZ: 160,
  wheel: false,
  shifter: false,
  handbrake: false,
};
const collisionCheck = (e) => e.checks.find((check) => check.id === 'collision');

test('without interference the desk check says so', () => {
  const e = evaluate(nearDesk);
  assert.deepEqual(e.deskInterferences, []);
  assert.equal(collisionCheck(e).value, 'No interference');
  assert.equal(collisionCheck(e).level, 'ok');
});

test('an interference with the desk names the cockpit part, the desk part and the way out', () => {
  const e = evaluate({ ...nearDesk, baseLift: 50 });
  assert.ok(e.deskInterferences.length > 0);
  for (const interference of e.deskInterferences) {
    assert.ok(COCKPIT_PARTS.includes(interference.part), interference.part);
    assert.ok(DESK_PARTS.includes(interference.item), interference.item);
    assert.ok(interference.depthCm > 0);
  }
  const check = collisionCheck(e);
  assert.equal(check.level, 'error');
  const count = e.deskInterferences.length;
  assert.equal(check.value, `${count} interference${count > 1 ? 's' : ''}`);
  assert.equal(check.detail, e.deskInterferences.map(describeInterference).join(' · '));
});
