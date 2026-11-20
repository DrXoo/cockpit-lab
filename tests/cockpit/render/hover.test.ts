import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../../../src/scene/render-list.ts';
import {
  resolveAssembly,
  type Face,
  type ProfilePart,
} from '../../../src/cockpit/cad/parts/assembly.ts';
import { present } from '../../support/lookups.ts';
import { drawHover } from '../../../src/cockpit/render/hover.ts';

const rail = (tiltDeg = 0): ProfilePart => ({
  kind: 'profile',
  id: 'rail',
  name: 'Rail',
  systemId: 'motedis-40-i-slot-8',
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 1000,
  placement: { kind: 'anchor', startMm: { x: 0, y: 40, z: 0 }, tiltDeg },
});
const hoverOf = (face: Face | null, tiltDeg = 0) => {
  const r = createRenderList();
  drawHover(r, ROOT, present(resolveAssembly([rail(tiltDeg)]).get('rail'), 'rail'), face);
  return r.primitives;
};
const rounded = (values: readonly number[]) =>
  values.map((value) => Math.round(value * 1000) / 1000);

test('the part under the pointer is wrapped in a see-through box just larger than it', () => {
  const [box] = hoverOf(null);
  assert.equal(box.kind, 'box');
  assert.equal(box.material, 'hover');
  assert.deepEqual(rounded(box.size), [4.4, 8.4, 100.4]);
  assert.deepEqual(rounded(box.position), [0, 4, 50]);
});

test('a face under the pointer is marked by a thin slab standing just off it', () => {
  const [slab] = hoverOf('+y');
  assert.equal(slab.kind, 'box');
  assert.deepEqual(rounded(slab.size), [4, 0.1, 100]);
  assert.deepEqual(rounded(slab.position), [0, 8.1, 50]);
  const [side] = hoverOf('-x');
  assert.equal(side.kind, 'box');
  assert.deepEqual(rounded(side.size), [0.1, 8, 100]);
  assert.deepEqual(rounded(side.position), [-2.1, 4, 50]);
});

test('a tilted part is marked in a group turned by its tilt', () => {
  const [group, box] = hoverOf(null, 12);
  assert.equal(group.kind, 'group');
  assert.equal(box.kind, 'box');
  assert.equal(box.parent, group.id);
});
