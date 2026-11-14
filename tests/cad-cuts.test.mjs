import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { cutList } from '../src/cad/cuts.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const profile = (id, name, sectionId, lengthMm, xMm = 0) => ({
  kind: 'profile',
  id,
  name,
  systemId: SYSTEM,
  sectionId,
  axis: 'z',
  heightAxis: 'y',
  lengthMm,
  placement: { kind: 'anchor', startMm: { x: xMm, y: 0, z: 0 } },
});

test('identical profiles are one cut, whatever their names, listed in order of appearance', () => {
  const parts = [
    profile('a', 'Left rail', '40x80', 1200, -300),
    profile('b', 'Post', '40x40', 400),
    profile('c', 'Right rail', '40x80', 1200, 300),
  ];
  assert.deepEqual(cutList(resolveAssembly(parts)), [
    {
      systemId: SYSTEM,
      sectionId: '40x80',
      lengthMm: 1200,
      quantity: 2,
      names: ['Left rail', 'Right rail'],
    },
    { systemId: SYSTEM, sectionId: '40x40', lengthMm: 400, quantity: 1, names: ['Post'] },
  ]);
});

test('cuts are whole millimetres, so lengths that round the same are one cut', () => {
  const parts = [profile('a', 'A', '40x40', 399.6), profile('b', 'B', '40x40', 400.4, 100)];
  const [cut] = cutList(resolveAssembly(parts));
  assert.equal(cut.lengthMm, 400);
  assert.equal(cut.quantity, 2);
});

test('the same length in another section is another cut', () => {
  const parts = [profile('a', 'A', '40x40', 400), profile('b', 'B', '40x80', 400, 100)];
  assert.equal(cutList(resolveAssembly(parts)).length, 2);
});
