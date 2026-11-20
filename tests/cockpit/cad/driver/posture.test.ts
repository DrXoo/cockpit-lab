import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAssembly,
  type ContactPoint,
  type Part,
  type PeripheralPart,
} from '../../../../src/cockpit/cad/parts/assembly.ts';
import type { PeripheralCategory } from '../../../../src/cockpit/cad/parts/catalog.ts';
import { cadContacts, type CadContacts } from '../../../../src/cockpit/cad/driver/posture.ts';
import { present } from '../../../support/lookups.ts';

const peripheral = (
  id: string,
  category: PeripheralCategory,
  contactPoints: ContactPoint[],
  changes: Partial<PeripheralPart> = {},
): PeripheralPart => ({
  kind: 'peripheral',
  id,
  name: id,
  category,
  envelope: { widthMm: 400, heightMm: 200, depthMm: 400 },
  mountingPattern: { holes: [] },
  contactPoints,
  source: { kind: 'estimated', reference: 'test' },
  facing: '+z',
  placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 0 } },
  ...changes,
});
const seat = (changes: Partial<PeripheralPart> = {}) =>
  peripheral('seat', 'seat', [{ role: 'hip', offsetMm: { x: 0, y: 0, z: 0 } }], {
    backrestDeg: 20,
    ...changes,
  });
const pedals = peripheral('pedals', 'pedals', [{ role: 'heel', offsetMm: { x: 0, y: 0, z: 0 } }], {
  placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 1000 } },
});
const wheel = peripheral(
  'wheel',
  'wheel-base',
  [{ role: 'hands', offsetMm: { x: 0, y: 0, z: 0 } }],
  {
    placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 600 } },
  },
);

function contactsOf(parts: readonly Part[]): CadContacts {
  const found = cadContacts(resolveAssembly(parts));
  assert.ok('contacts' in found, 'The parts carry no contacts.');
  return found.contacts;
}
function missingContact(parts: readonly Part[]): string {
  const found = cadContacts(resolveAssembly(parts));
  assert.ok('reason' in found, 'The parts carry every contact.');
  return found.reason;
}

test('the contacts are where the peripherals carry them, in mm', () => {
  const contacts = contactsOf([seat(), pedals, wheel]);
  assert.equal(contacts.heel.z - contacts.hip.z, 1000);
  assert.equal(present(contacts.hands, 'hands').z - contacts.hip.z, 600);
  assert.equal(contacts.heel.y, contacts.hip.y);
  assert.equal(contacts.reclineDeg, 20);
  assert.equal(contacts.facing, '+z');
});

test('without a part for the hands, the hands have no contact', () => {
  assert.equal(contactsOf([seat(), pedals]).hands, null);
});

test('a design without a seat or pedals cannot seat the driver, and says what to mount', () => {
  assert.equal(missingContact([pedals]), "Mount a seat: it carries the driver's hip.");
  assert.equal(missingContact([seat()]), "Mount pedals: they carry the driver's heels.");
});

test('two parts that seat the driver cannot seat one', () => {
  assert.match(missingContact([seat(), seat({ id: 'second-seat' }), pedals]), /hip/);
});

test('grips for each hand leave the driver seated', () => {
  const grip = (id: string, hand: 'left' | 'right') =>
    peripheral(id, 'side-stick', [{ role: 'grip', offsetMm: { x: 0, y: 0, z: 0 } }], { hand });
  const contacts = contactsOf([
    seat(),
    pedals,
    wheel,
    grip('stick', 'right'),
    grip('throttle', 'left'),
  ]);
  assert.equal(contacts.heel.z - contacts.hip.z, 1000);
});

test('each grip is listed with its hand, held on a stick or throttle and reached otherwise', () => {
  const grip = (id: string, category: PeripheralCategory, hand: 'left' | 'right') =>
    peripheral(id, category, [{ role: 'grip', offsetMm: { x: 0, y: 300, z: 0 } }], { hand });
  const contacts = contactsOf([
    seat(),
    pedals,
    grip('stick', 'center-stick', 'right'),
    grip('throttle', 'throttle', 'left'),
    grip('shifter', 'shifter', 'right'),
  ]);
  assert.deepEqual(
    contacts.grips.map(({ partId, name, hand, use, pointMm }) => [
      partId,
      name,
      hand,
      use,
      pointMm,
    ]),
    [
      ['stick', 'stick', 'right', 'held', { x: 0, y: 300, z: 0 }],
      ['throttle', 'throttle', 'left', 'held', { x: 0, y: 300, z: 0 }],
      ['shifter', 'shifter', 'right', 'reached', { x: 0, y: 300, z: 0 }],
    ],
  );
});
