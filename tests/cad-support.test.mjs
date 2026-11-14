import test from 'node:test';
import assert from 'node:assert/strict';
import { designFromBase } from '../src/cockpit-design.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { partsFromParametric } from '../src/cad/from-parametric.ts';
import { unsupportedParts } from '../src/cad/support.ts';

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
const footUnder = (parentId) => ({
  kind: 'foot',
  id: `foot-${parentId}`,
  name: `Foot under ${parentId}`,
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId, face: '-y', alongMm: 0, fromEnd: 'start' },
});

const unsupported = (parts) => unsupportedParts(resolveAssembly(parts));

test('a frame on feet has every part supported', () => {
  const parts = [
    rail('left-rail', -280),
    rail('right-rail', 280),
    crossmember,
    footUnder('left-rail'),
    footUnder('right-rail'),
  ];
  assert.deepEqual(unsupported(parts), []);
});

test('support reaches through joints, from a part on feet to the parts joined to it', () => {
  const parts = [
    rail('left-rail', -280),
    rail('right-rail', 280),
    crossmember,
    footUnder('left-rail'),
  ];
  assert.deepEqual(unsupported(parts), []);
});

test('parts that no joint connects to a part on feet are unsupported, in design order', () => {
  const floating = {
    ...rail('floating', 0),
    placement: { kind: 'anchor', startMm: { x: 0, y: 400, z: 0 } },
  };
  const parts = [rail('left-rail', -280), floating, rail('right-rail', 280), crossmember];
  assert.deepEqual(unsupported(parts), ['left-rail', 'floating', 'right-rail', 'rear']);
});

test('a converted design reports the parts the parametric drawing leaves unconnected', () => {
  const design = { ...designFromBase('gt'), baseLift: 10, wheel: true, hotas: false };
  const parts = partsFromParametric(design);
  const reported = unsupported(parts);
  const supported = parts
    .map((part) => part.id)
    .filter((id) => !reported.includes(id))
    .filter((id) => !id.startsWith('foot-'));
  assert.deepEqual(supported.sort(), [
    'base-crossmember-front',
    'base-crossmember-middle',
    'base-crossmember-rear',
    'base-extension-front-left',
    'base-extension-front-right',
    'base-extension-rear-left',
    'base-extension-rear-right',
    'base-rail-left',
    'base-rail-right',
    'wheel-upright-left',
    'wheel-upright-right',
  ]);
  assert.ok(reported.includes('seat-post-rear-right'));
});
