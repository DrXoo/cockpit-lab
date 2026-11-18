import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { cadContacts } from '../src/cad/posture.ts';

const peripheral = (id, contactPoints, changes = {}) => ({
  kind: 'peripheral',
  id,
  name: id,
  envelope: { widthMm: 400, heightMm: 200, depthMm: 400 },
  mountingPattern: { holes: [] },
  contactPoints,
  source: { kind: 'estimated', reference: 'test' },
  facing: '+z',
  placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 0 } },
  ...changes,
});
const seat = (changes = {}) =>
  peripheral('seat', [{ role: 'hip', offsetMm: { x: 0, y: 0, z: 0 } }], {
    backrestDeg: 20,
    ...changes,
  });
const pedals = peripheral('pedals', [{ role: 'heel', offsetMm: { x: 0, y: 0, z: 0 } }], {
  placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 1000 } },
});
const wheel = peripheral('wheel', [{ role: 'hands', offsetMm: { x: 0, y: 0, z: 0 } }], {
  placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 600 } },
});

const contactsOf = (parts) => cadContacts(resolveAssembly(parts));

test('the contacts are where the peripherals carry them, in cm on the side plane', () => {
  const contacts = contactsOf([seat(), pedals, wheel]);
  const atSeat = contacts.hip;
  assert.equal(contacts.heel.z - atSeat.z, 100);
  assert.equal(contacts.hands.z - atSeat.z, 60);
  assert.equal(contacts.heel.y, atSeat.y);
  assert.equal(contacts.reclineDeg, 20);
});

test('without a part for the hands, the hands have no contact', () => {
  assert.equal(contactsOf([seat(), pedals]).hands, null);
});

test('a design without a seat or pedals cannot seat the driver', () => {
  assert.throws(() => contactsOf([pedals]), /hip/);
  assert.throws(() => contactsOf([seat()]), /heel/);
});

test('two parts that seat the driver are an error', () => {
  assert.throws(() => contactsOf([seat(), seat({ id: 'second-seat' }), pedals]), /hip/);
});
