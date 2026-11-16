import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { cadChecks } from '../src/cad-checks.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const bar = (id, name, startMm, changes = {}) => ({
  kind: 'profile',
  id,
  name,
  systemId: SYSTEM,
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 400,
  placement: { kind: 'anchor', startMm },
  ...changes,
});
const footUnder = (parentId) => ({
  kind: 'foot',
  id: `foot-${parentId}`,
  name: 'Foot',
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId, face: '-y', alongMm: 0, fromEnd: 'start' },
});
const checksFor = (parts) =>
  Object.fromEntries(cadChecks(resolveAssembly(parts)).map((c) => [c.id, c]));

test('a sound design passes both checks, with nothing to list', () => {
  const checks = checksFor([bar('a', 'Rail', { x: 0, y: 100, z: 0 }), footUnder('a')]);
  assert.deepEqual(
    Object.values(checks).map(({ id, level, value, items }) => ({ id, level, value, items })),
    [
      { id: 'cad-interference', level: 'ok', value: 'None', items: [] },
      { id: 'cad-support', level: 'ok', value: 'None', items: [] },
    ],
  );
});

test('interference within the cockpit is one warning listing each pair, in cm', () => {
  const parts = [
    bar('a', 'Seat post', { x: 0, y: 100, z: 0 }),
    bar('b', 'Seat crossmember', { x: -200, y: 130, z: 200 }, { axis: 'x' }),
    footUnder('a'),
    footUnder('b'),
  ];
  const check = checksFor(parts)['cad-interference'];
  assert.equal(check.level, 'warning');
  assert.equal(check.value, '1');
  assert.deepEqual(check.items, ['Seat post into Seat crossmember: 1 cm up or down']);
});

test('unsupported parts are one warning listing their names', () => {
  const parts = [
    bar('a', 'Rail', { x: 0, y: 100, z: 0 }),
    footUnder('a'),
    bar('b', 'Floating post', { x: 500, y: 400, z: 0 }),
  ];
  const check = checksFor(parts)['cad-support'];
  assert.equal(check.level, 'warning');
  assert.equal(check.value, '1');
  assert.deepEqual(check.items, ['Floating post']);
});
