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

test('the contacts are where the peripherals carry them, in mm', () => {
  const { contacts } = contactsOf([seat(), pedals, wheel]);
  assert.equal(contacts.heel.z - contacts.hip.z, 1000);
  assert.equal(contacts.hands.z - contacts.hip.z, 600);
  assert.equal(contacts.heel.y, contacts.hip.y);
  assert.equal(contacts.reclineDeg, 20);
  assert.equal(contacts.facing, '+z');
});

test('without a part for the hands, the hands have no contact', () => {
  assert.equal(contactsOf([seat(), pedals]).contacts.hands, null);
});

test('a design without a seat or pedals cannot seat the driver, and says what to mount', () => {
  assert.equal(contactsOf([pedals]).reason, "Mount a seat: it carries the driver's hip.");
  assert.equal(contactsOf([seat()]).reason, "Mount pedals: they carry the driver's heels.");
});

test('two parts that seat the driver cannot seat one', () => {
  assert.match(contactsOf([seat(), seat({ id: 'second-seat' }), pedals]).reason, /hip/);
});
