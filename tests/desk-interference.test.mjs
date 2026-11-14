import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate } from '../src/model.ts';
import { describeInterference } from '../src/interference.ts';
import { partsFromParametric } from '../src/cad/from-parametric.ts';

/** The names of the parts the design converts to, which interference reports. */
const cockpitPartNames = (state) => partsFromParametric(state).map((part) => part.name);
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
  const state = { ...nearDesk, baseLift: 50 };
  const e = evaluate(state);
  assert.ok(e.deskInterferences.length > 0);
  for (const interference of e.deskInterferences) {
    assert.ok(cockpitPartNames(state).includes(interference.part), interference.part);
    assert.ok(DESK_PARTS.includes(interference.item), interference.item);
    assert.ok(interference.depthCm > 0);
  }
  const check = collisionCheck(e);
  assert.equal(check.level, 'error');
  const count = e.deskInterferences.length;
  assert.equal(check.value, `${count} interference${count > 1 ? 's' : ''}`);
  assert.equal(check.detail, e.deskInterferences.map(describeInterference).join(' · '));
});

test('a desk over the cockpit is reached by each part by its own name', () => {
  const state = { ...defaults, deskX: 0, deskZ: 60 };
  const parts = evaluate(state).deskInterferences.map((interference) => interference.part);
  assert.ok(parts.length > 0);
  for (const part of parts) assert.ok(cockpitPartNames(state).includes(part), part);
  assert.ok(parts.includes('Seat'), parts.join(', '));
});
