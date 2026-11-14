import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/model.ts';
import { anatomy, parametricContacts, postureFrom } from '../src/anatomy.ts';

const driver = { heightCm: defaults.height, reclineDeg: defaults.recline };

test('the parametric design meets the driver at the seat, the pedals and the wheel', () => {
  const s = defaults;
  assert.deepEqual(parametricContacts(s), {
    hip: { z: s.seatZ, y: s.seatH + 4 },
    heel: { z: s.pedalZ - 5, y: s.pedalH + 8 },
    hands: { z: s.wheelZ - 2, y: s.wheelH + 1 },
  });
  assert.deepEqual(anatomy(s), postureFrom(driver, parametricContacts(s)));
});

test('the posture follows the contact points: moving the hip moves the eyes with it', () => {
  const contacts = parametricContacts(defaults);
  const moved = { ...contacts, hip: { z: contacts.hip.z + 10, y: contacts.hip.y + 5 } };
  const before = postureFrom(driver, contacts).eye;
  const after = postureFrom(driver, moved).eye;
  assert.ok(Math.abs(after.z - before.z - 10) < 1e-9);
  assert.ok(Math.abs(after.y - before.y - 5) < 1e-9);
});

test('without a contact for the hands, the posture has no arms and the rest is unchanged', () => {
  const contacts = parametricContacts(defaults);
  const withHands = postureFrom(driver, contacts);
  const withoutHands = postureFrom(driver, { hip: contacts.hip, heel: contacts.heel });
  assert.equal(withoutHands.hands, null);
  assert.deepEqual(withHands.hands.point, contacts.hands);
  assert.deepEqual({ ...withoutHands, hands: null }, { ...withHands, hands: null });
});
