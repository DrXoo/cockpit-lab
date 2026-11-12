import test from 'node:test';
import assert from 'node:assert/strict';
import { rectangle } from '../src/geometry.ts';
import { solidOverlap, findInterferences, describeInterference } from '../src/interference.ts';

const ORIGIN = { x: 0, z: 0, angle: 0 };
const TOLERANCE = { heightCm: 0.1, planCm: 0.1 };

/** A box from x0..x1, z0..z1 and y0..y1, in cm. */
const box = (x0, x1, z0, z1, y0, y1) => ({ polygon: rectangle(x0, x1, z0, z1, ORIGIN), y0, y1 });

test('volumes that are apart or only touch do not overlap', () => {
  const desktop = box(0, 100, 0, 60, 72.5, 75);
  assert.equal(solidOverlap(desktop, box(0, 100, 0, 60, 75, 90), TOLERANCE), null);
  assert.equal(solidOverlap(desktop, box(0, 100, 0, 60, 75.05, 90), TOLERANCE), null);
  assert.equal(solidOverlap(desktop, box(100.05, 150, 0, 60, 0, 100), TOLERANCE), null);
  assert.equal(solidOverlap(desktop, box(200, 300, 0, 60, 0, 100), TOLERANCE), null);
});

test('an overlap is measured along the axis that separates the volumes soonest', () => {
  const desktop = box(0, 100, 0, 60, 72.5, 75);
  const wheel = box(40, 60, 50, 80, 60, 74);
  assert.deepEqual(solidOverlap(desktop, wheel, TOLERANCE), { depthCm: 1.5, axis: 'vertical' });

  const seat = box(90, 130, 10, 40, 0, 100);
  assert.deepEqual(solidOverlap(desktop, seat, TOLERANCE), { depthCm: 10, axis: 'plan' });
});

test('interferences name both parts, once per pair, deepest first', () => {
  const named = (label, solid) => ({ ...solid, label });
  const cockpit = [
    named('Seat', box(90, 130, 10, 40, 0, 100)),
    named('Wheel', box(40, 60, 50, 80, 60, 74)),
    named('Pedals', box(40, 60, 200, 240, 0, 30)),
  ];
  const desk = [
    named('Desktop', box(0, 100, 0, 60, 72.5, 75)),
    named('Desk column', box(95, 105, 20, 30, 6, 71)),
    named('Desk column', box(-5, 5, 20, 30, 6, 71)),
  ];
  assert.deepEqual(findInterferences(cockpit, desk, TOLERANCE), [
    { part: 'Seat', item: 'Desk column', depthCm: 15, axis: 'plan' },
    { part: 'Seat', item: 'Desktop', depthCm: 10, axis: 'plan' },
    { part: 'Wheel', item: 'Desktop', depthCm: 1.5, axis: 'vertical' },
  ]);
});

test('an interference reads as the part, the item and the way out', () => {
  assert.equal(
    describeInterference({ part: 'Wheel', item: 'Desktop', depthCm: 1.53, axis: 'vertical' }),
    'Wheel into Desktop: 1.6 cm vertically',
  );
  assert.equal(
    describeInterference({ part: 'Seat', item: 'Bed', depthCm: 12, axis: 'plan' }),
    'Seat into Bed: 12 cm in the plan',
  );
});
