import test from 'node:test';
import assert from 'node:assert/strict';
import { postureFrom } from '../src/anatomy.ts';

const driver = { heightCm: 178, reclineDeg: 20 };
/** A seated driver's contacts in the side plane, in cm. */
const contacts = {
  hip: { z: 40, y: 36 },
  heel: { z: 113, y: 26 },
  hands: { z: 72, y: 69 },
};

test('the posture follows the contact points: moving the hip moves the eyes with it', () => {
  const moved = { ...contacts, hip: { z: contacts.hip.z + 10, y: contacts.hip.y + 5 } };
  const before = postureFrom(driver, contacts).eye;
  const after = postureFrom(driver, moved).eye;
  assert.ok(Math.abs(after.z - before.z - 10) < 1e-9);
  assert.ok(Math.abs(after.y - before.y - 5) < 1e-9);
});

test('without a contact for the hands, the posture has no arms and the rest is unchanged', () => {
  const withHands = postureFrom(driver, contacts);
  const withoutHands = postureFrom(driver, { hip: contacts.hip, heel: contacts.heel });
  assert.equal(withoutHands.hands, null);
  assert.deepEqual(withHands.hands.point, contacts.hands);
  assert.deepEqual({ ...withoutHands, hands: null }, { ...withHands, hands: null });
});
