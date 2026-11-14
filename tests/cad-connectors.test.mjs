import test from 'node:test';
import assert from 'node:assert/strict';
import { designFromBase } from '../src/cockpit-design.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { jointsOf } from '../src/cad/joints.ts';
import {
  adjustmentsFromParametric,
  connectorsFromParametric,
  partsFromParametric,
} from '../src/cad/from-parametric.ts';

const design = { ...designFromBase('gt'), baseLift: 10, wheel: true };
const parts = partsFromParametric(design);
const connectors = connectorsFromParametric(parts);

test('the conversion puts a 40 corner bracket on each side of every joint', () => {
  const joints = jointsOf(resolveAssembly(parts));
  assert.equal(connectors.length, joints.length * 2);
  for (const joint of joints) {
    const onJoint = connectors.filter((connector) => connector.jointId === joint.id);
    assert.equal(onJoint.length, 2, joint.id);
    for (const connector of onJoint) assert.equal(connector.typeId, 'corner-bracket-40');
  }
  assert.equal(new Set(connectors.map((connector) => connector.id)).size, connectors.length);
});

test('the two brackets of a joint sit on opposite sides, along the part it meets', () => {
  // The rear base crossmember meets the right side rail, which runs along z.
  const sides = connectors
    .filter((connector) => connector.jointId === 'base-crossmember-rear@base-rail-right')
    .map((connector) => connector.side);
  assert.deepEqual(sides, ['-z', '+z']);
  // A base extension meets the underside of its rail, which runs along z as well.
  const extensionSides = connectors
    .filter((connector) => connector.jointId === 'base-extension-rear-right@base-rail-right')
    .map((connector) => connector.side);
  assert.deepEqual(extensionSides, ['-z', '+z']);
});

test('a converted design adjusts the seat, the pedal plate and the wheel plate fore and aft', () => {
  const adjustments = adjustmentsFromParametric({ ...designFromBase('gt'), wheel: true });
  assert.deepEqual(
    adjustments.map(({ id, partId, axis, travelMm }) => ({ id, partId, axis, travelMm })),
    [
      { id: 'seat-fore-aft', partId: 'seat', axis: 'z', travelMm: 200 },
      { id: 'pedals-fore-aft', partId: 'pedal-plate', axis: 'z', travelMm: 100 },
      { id: 'wheel-fore-aft', partId: 'wheel-plate', axis: 'z', travelMm: 100 },
    ],
  );
  for (const adjustment of adjustments) assert.equal(adjustment.source.kind, 'estimated');
  const parts = new Set(
    partsFromParametric({ ...designFromBase('gt'), wheel: true }).map((p) => p.id),
  );
  for (const adjustment of adjustments) assert.ok(parts.has(adjustment.partId), adjustment.partId);
  const withoutWheel = adjustmentsFromParametric({ ...designFromBase('gt'), wheel: false });
  assert.ok(!withoutWheel.some((adjustment) => adjustment.id === 'wheel-fore-aft'));
});
