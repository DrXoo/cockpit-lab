import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, presets } from '../src/model.ts';
import { getParts } from '../src/parts.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { cutList } from '../src/cad/cuts.ts';
import { jointsOf } from '../src/cad/joints.ts';
import { partsFromParametric } from '../src/cad/from-parametric.ts';

const accessory = (list, name) => list.accessories.find((item) => item.name === name);

test('each cut is one row that names the parts cut to that length', () => {
  const list = getParts(defaults);
  const cuts = cutList(resolveAssembly(partsFromParametric(defaults)));
  assert.equal(list.parts.length, cuts.length);
  const rails = list.parts[0];
  assert.deepEqual(rails, {
    name: 'Base side rail, right; Base side rail, left',
    profile: '40 × 80',
    qty: 2,
    mm: defaults.length * 10,
    total: defaults.length * 10 * 2,
  });
});

test('two 40 corner brackets per joint, with the bolts and T-nuts they need', () => {
  const list = getParts(defaults);
  const joints = jointsOf(resolveAssembly(partsFromParametric(defaults))).length;
  assert.equal(list.joints, joints);
  assert.equal(accessory(list, '40 corner bracket').qty, joints * 2);
  assert.equal(accessory(list, 'M8 bolt').qty, joints * 2 * 4);
  assert.equal(accessory(list, 'T-nut, slot 8, M8').qty, joints * 2 * 4);
});

test('the feet come from the design, by type', () => {
  assert.equal(accessory(getParts({ ...defaults, feet: 'level' }), 'Leveling foot').qty, 4);
  assert.equal(accessory(getParts({ ...defaults, feet: 'casters' }), 'Locking caster').qty, 4);
});

test('plates and the seat stay accessories, as before', () => {
  const flight = getParts({ ...defaults, ...presets.flight.values });
  assert.ok(flight.accessories.some((item) => item.name === 'Removable HOTAS plates'));
  assert.ok(flight.accessories.some((item) => item.name === 'Manual car seat + rails'));
});

test('a converted design has no joints pending, as every joint gets its brackets', () => {
  assert.deepEqual(getParts(defaults).pendingJoints, []);
});
