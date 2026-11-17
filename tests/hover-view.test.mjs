import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { hoverLabel } from '../src/hover-view.ts';

const rail = {
  kind: 'profile',
  id: 'rail',
  name: 'Left rail',
  systemId: 'motedis-40-i-slot-8',
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 1200,
  placement: { kind: 'anchor', startMm: { x: 0, y: 40, z: 0 } },
};
const plate = {
  kind: 'plate',
  id: 'plate',
  name: 'Plate 6',
  widthMm: 300,
  depthMm: 250,
  sheetId: 'aluminium-8',
  normal: '+y',
  depthAxis: 'z',
  ownHoles: [],
  placement: { kind: 'attachment', parentId: 'rail', face: '+y', alongMm: 600, fromEnd: 'start' },
};
const foot = {
  kind: 'foot',
  id: 'foot',
  name: 'Leveling foot 3',
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId: 'rail', face: '-y', alongMm: 36, fromEnd: 'start' },
};
const resolved = resolveAssembly([rail, plate, foot]);

test('a profile is named with its section and length', () => {
  assert.equal(hoverLabel(resolved.get('rail')), 'Left rail · 40 × 80 · 1200 mm');
});

test('a plate is named with its size and thickness, and a foot by its name', () => {
  assert.equal(hoverLabel(resolved.get('plate')), 'Plate 6 · 300 × 250 mm · 8 mm');
  assert.equal(hoverLabel(resolved.get('foot')), 'Leveling foot 3');
});
