import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designFromBase, designOnItsOwn } from '../src/cockpit-design.ts';
import { parametricContacts } from '../src/anatomy.ts';
import { readProject } from '../src/project.ts';
import { rigLift } from '../src/rig.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { partsFromParametric } from '../src/cad/from-parametric.ts';
import { cadContacts } from '../src/cad/posture.ts';

const fixtureDesign = (name) => {
  const data = JSON.parse(readFileSync(new URL(`../e2e/fixtures/${name}.json`, import.meta.url)));
  return readProject(data).cockpit;
};

const designs = {
  'GT base': designFromBase('gt'),
  'flight base': designFromBase('flight'),
  'hybrid base': designFromBase('hybrid'),
  'small base': designFromBase('small'),
  'gt-room fixture': fixtureDesign('gt-room'),
  'flight-lifted fixture': fixtureDesign('flight-lifted'),
  'legacy-v1 fixture': fixtureDesign('legacy-v1'),
  'steep design': {
    ...designFromBase('gt'),
    pedalTilt: 35,
    wheelTilt: 30,
    recline: 40,
    baseLift: 9,
  },
};

const near = (actual, expected, label) => {
  assert.ok(Math.abs(actual.z - expected.z) < 1e-9, `${label} z: ${actual.z} != ${expected.z}`);
  assert.ok(Math.abs(actual.y - expected.y) < 1e-9, `${label} y: ${actual.y} != ${expected.y}`);
};

for (const [name, design] of Object.entries(designs)) {
  test(`the ${name} meets the driver at the same points once converted`, () => {
    // The parametric points are above the base; the CAD's are in cockpit coordinates.
    const lift = rigLift(design);
    const raised = (point) => ({ z: point.z, y: point.y + lift });
    const parametric = parametricContacts(designOnItsOwn(design));
    const expected = {
      hip: raised(parametric.hip),
      heel: raised(parametric.heel),
      hands: raised(parametric.hands),
    };
    const contacts = cadContacts(resolveAssembly(partsFromParametric(design)));
    near(contacts.hip, expected.hip, 'hip');
    near(contacts.heel, expected.heel, 'heel');
    if (design.wheel) near(contacts.hands, expected.hands, 'hands');
    else assert.equal(contacts.hands, null);
    assert.equal(contacts.reclineDeg, design.recline);
  });
}

test('a converted design has a seat, pedals and a wheel, sized as estimates', () => {
  const parts = partsFromParametric({ ...designFromBase('gt'), wheel: true });
  const peripherals = parts.filter((part) => part.kind === 'peripheral');
  const ids = peripherals.map((part) => part.id);
  for (const id of ['seat', 'pedals', 'wheel']) assert.ok(ids.includes(id), id);
  for (const part of peripherals) assert.equal(part.source.kind, 'estimated');
});

test('the pedals stand on the tilted pedal plate, and the wheel on its plate', () => {
  const design = { ...designFromBase('gt'), wheel: true };
  const parts = partsFromParametric(design);
  const byId = new Map(parts.map((part) => [part.id, part]));
  assert.equal(byId.get('pedals').placement.parentId, 'pedal-plate');
  assert.equal(byId.get('pedal-plate').placement.tiltDeg, design.pedalTilt);
  assert.equal(byId.get('wheel').placement.parentId, 'wheel-plate');
  assert.equal(byId.get('wheel-plate').placement.tiltDeg, design.wheelTilt);
});

test('two parts that seat the driver are an error', () => {
  const parts = partsFromParametric(designFromBase('gt'));
  const seat = parts.find((part) => part.id === 'seat');
  assert.throws(
    () => cadContacts(resolveAssembly([...parts, { ...seat, id: 'second-seat' }])),
    /hip/,
  );
});
