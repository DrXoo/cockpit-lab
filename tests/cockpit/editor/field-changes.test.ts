import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustmentChange,
  footChange,
  partChange,
  peripheralChange,
  plateChange,
} from '../../../src/cockpit/editor/field-changes.ts';
import {
  adjustmentField,
  partField,
  type PartField,
} from '../../../src/cockpit/editor/part-fields.ts';
import {
  anchoredProfiles,
  growthTowardsRail,
  railHistory,
  withGrowth,
  withPeripheral,
} from '../../support/designs.ts';
import { ofKind, present } from '../../support/lookups.ts';

const anchored = () => ofKind(anchoredProfiles(1)[0], 'add-anchored-profile');
const grown = () => ofKind(withGrowth(railHistory(), 'part-1')[1], 'grow-profile');

test('a field of the inspector changes one value of the operation', () => {
  const operation = anchored();
  assert.deepEqual(partChange(operation, 'name', 'Rail'), { name: 'Rail' });
  assert.deepEqual(partChange(operation, 'sectionId', '40x80'), { sectionId: '40x80' });
  assert.deepEqual(partChange(operation, 'axis', 'y'), { axis: 'y' });
  assert.deepEqual(partChange(operation, 'heightAxis', 'x'), { heightAxis: 'x' });
  assert.deepEqual(partChange(operation, 'lengthMm', '650'), { lengthMm: 650 });
  assert.deepEqual(partChange(operation, 'startZ', '-120.5'), {
    startMm: { x: 0, y: 20, z: -120.5 },
  });
});

test('a number field left empty or not a number gives no number to apply', () => {
  const operation = anchored();
  assert.ok(Number.isNaN(partChange(operation, 'lengthMm', '').lengthMm));
  assert.ok(Number.isNaN(present(partChange(operation, 'startX', 'abc').startMm, 'start').x));
});

test('the markup names only fields the inspector has', () => {
  assert.equal(partField('lengthMm'), 'lengthMm');
  assert.equal(partField('depthAxis'), 'depthAxis');
  assert.equal(partField('facing'), 'facing');
  assert.throws(() => partField('tiltDeg'), /tiltDeg/);
  assert.throws(() => partField(undefined), /undefined/);
});

test('the place on the face comes from its own fields', () => {
  const growth = grown();
  assert.deepEqual(partChange(growth, 'face', '-x'), { face: '-x' });
  assert.deepEqual(partChange(growth, 'fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(partChange(growth, 'alongMm', '120'), { alongMm: 120 });
  assert.deepEqual(partChange(growth, 'acrossMm', '-4'), { acrossMm: -4 });
  assert.throws(() => partChange(growth, 'startX', '0'), /no start/);
  assert.throws(() => partChange(growth, 'face', 'up'), /face/);
});

test('a growth grows out of its face or along it, and its end is free or reaches a part', () => {
  const growth = grown();
  assert.deepEqual(partChange(growth, 'way', '-x'), { way: '-x' });
  assert.deepEqual(partChange(growth, 'way', 'out'), { way: 'out' });
  const towards = ofKind(growthTowardsRail()[2], 'grow-profile');
  assert.deepEqual(partChange(towards, 'reachesId', 'part-2'), { reachesId: 'part-2' });
  assert.deepEqual(partChange(towards, 'reachesId', ''), { reachesId: null });
});

test('the fields of a foot change the values of its operation', () => {
  assert.deepEqual(footChange('footTypeId', 'locking-caster'), { footTypeId: 'locking-caster' });
  assert.deepEqual(footChange('fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(footChange('alongMm', ''), { alongMm: Number.NaN });
  assert.throws(() => footChange('lengthMm', '300'), /lengthMm/);
});

test('the fields of a plate change the values of its operation', () => {
  assert.deepEqual(plateChange('name', 'Wheel plate'), { name: 'Wheel plate' });
  assert.deepEqual(plateChange('sheetId', 'aluminium-4'), { sheetId: 'aluminium-4' });
  assert.deepEqual(plateChange('processId', 'hand-drilling'), { processId: 'hand-drilling' });
  assert.deepEqual(plateChange('widthMm', '250'), { widthMm: 250 });
  assert.deepEqual(plateChange('depthMm', ''), { depthMm: Number.NaN });
  assert.deepEqual(plateChange('depthAxis', 'x'), { depthAxis: 'x' });
  assert.deepEqual(plateChange('face', '-y'), { face: '-y' });
  assert.deepEqual(plateChange('fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(plateChange('alongMm', '120'), { alongMm: 120 });
  assert.deepEqual(plateChange('acrossMm', '-40'), { acrossMm: -40 });
  assert.throws(() => plateChange('lengthMm', '300'), /lengthMm/);
});

test('the fields of a peripheral change the values of its operation', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  const pedals = ofKind(history[1], 'mount-peripheral');
  const change = (field: PartField, value: string, item?: string) =>
    peripheralChange(pedals, field, value, item);
  assert.deepEqual(change('name', 'Seat'), { name: 'Seat' });
  assert.deepEqual(change('face', '+x'), { face: '+x' });
  assert.deepEqual(change('facing', '-x'), { facing: '-x' });
  assert.deepEqual(change('fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(change('alongMm', '120'), { alongMm: 120 });
  assert.deepEqual(change('acrossMm', ''), { acrossMm: Number.NaN });
  assert.deepEqual(change('heightMm', '220'), {
    envelope: { widthMm: 400, heightMm: 220, depthMm: 320 },
  });
  assert.deepEqual(change('backrestDeg', '20'), { backrestDeg: 20 });
  const holes = present(change('holeDiameterMm', '10', '1').mountingPattern, 'pattern').holes;
  assert.deepEqual(holes[1], { xMm: -160, yMm: 120, diameterMm: 10 });
  assert.deepEqual(holes[0], pedals.mountingPattern.holes[0]);
  assert.deepEqual(change('contactYMm', '40', 'heel'), {
    contactPoints: [{ role: 'heel', offsetMm: { x: 0, y: 40, z: -130 } }],
  });
  assert.throws(() => change('holeXMm', '0', '7'), /no hole 8/);
  assert.throws(() => change('contactXMm', '0', 'hip'), /no hip contact point/);
  assert.throws(() => change('sheetId', 'aluminium-4'), /sheetId/);
  assert.throws(() => change('typeId', 'generic-seat'), /swap/);
  assert.deepEqual(change('hand', 'left'), { hand: 'left' });
  assert.throws(() => change('hand', 'both'), /both/);
});

test('a value typed in the adjustment changes its axis, travel or position', () => {
  assert.deepEqual(adjustmentChange('axis', 'x'), { axis: 'x' });
  assert.deepEqual(adjustmentChange('travelMm', '150'), { travelMm: 150 });
  assert.deepEqual(adjustmentChange('positionMm', '-20'), { positionMm: -20 });
  assert.ok(Number.isNaN(adjustmentChange('positionMm', ' ').positionMm));
  assert.throws(() => adjustmentChange('axis', 'w'), /w/);
  assert.equal(adjustmentField('travelMm'), 'travelMm');
  assert.throws(() => adjustmentField('lengthMm'), /lengthMm/);
});
