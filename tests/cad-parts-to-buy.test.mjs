import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { partsToBuy } from '../src/cad/parts-to-buy.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const rail = (id, xMm) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: SYSTEM,
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 1200,
  placement: { kind: 'anchor', startMm: { x: xMm, y: 100, z: 0 } },
});
const crossmember = {
  ...rail('rear', 0),
  name: 'Rear crossmember',
  axis: 'x',
  lengthMm: 0,
  placement: {
    kind: 'span',
    parentId: 'left-rail',
    face: '+x',
    alongMm: 100,
    fromEnd: 'start',
    reachesId: 'right-rail',
  },
};
const foot = (id, parentId, footTypeId) => ({
  kind: 'foot',
  id,
  name: id,
  footTypeId,
  placement: { kind: 'attachment', parentId, face: '-y', alongMm: 0, fromEnd: 'start' },
});
const bracket = (id, side) => ({
  id,
  jointId: 'rear@left-rail',
  typeId: 'corner-bracket-40',
  side,
});

const resolved = resolveAssembly([
  rail('left-rail', -280),
  rail('right-rail', 280),
  crossmember,
  foot('f1', 'left-rail', 'leveling-foot'),
  foot('f2', 'right-rail', 'leveling-foot'),
]);

test('the parts to buy count cuts, connectors with their fasteners, and feet', () => {
  const list = partsToBuy(resolved, [bracket('a', '-z'), bracket('b', '+z')]);
  assert.deepEqual(
    list.cuts.map((cut) => [cut.sectionId, cut.lengthMm, cut.quantity]),
    [
      ['40x80', 1200, 2],
      ['40x80', 520, 1],
    ],
  );
  assert.deepEqual(list.connectors, [
    { typeId: 'corner-bracket-40', name: '40 corner bracket', quantity: 2 },
  ]);
  assert.deepEqual(list.fasteners, [
    { id: 'bolt-m8', quantity: 8 },
    { id: 't-nut-slot-8-m8', quantity: 8 },
  ]);
  assert.deepEqual(list.feet, [{ typeId: 'leveling-foot', name: 'Leveling foot', quantity: 2 }]);
});

test('joints without connectors are listed as pending, with the names of their parts', () => {
  const list = partsToBuy(resolved, [bracket('a', '-z')]);
  assert.deepEqual(list.pendingJoints, [
    { jointId: 'rear@right-rail', partName: 'Rear crossmember', toPartName: 'right-rail' },
  ]);
});

test('a connector on a joint that does not exist is an error', () => {
  const orphan = { ...bracket('a', '-z'), jointId: 'rear@nowhere' };
  assert.throws(() => partsToBuy(resolved, [orphan]), /rear@nowhere/);
});
