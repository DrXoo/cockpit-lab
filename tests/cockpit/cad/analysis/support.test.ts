import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAssembly,
  type FootPart,
  type Part,
  type PeripheralPart,
  type PlatePart,
  type ProfilePart,
} from '../../../../src/cockpit/cad/parts/assembly.ts';
import { unsupportedParts } from '../../../../src/cockpit/cad/analysis/support.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const rail = (id: string, xMm: number): ProfilePart => ({
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
const crossmember: ProfilePart = {
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
const footUnder = (parentId: string): FootPart => ({
  kind: 'foot',
  id: `foot-${parentId}`,
  name: `Foot under ${parentId}`,
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId, face: '-y', alongMm: 0, fromEnd: 'start' },
});

const unsupported = (parts: readonly Part[]) => unsupportedParts(resolveAssembly(parts));

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
  const floating: ProfilePart = {
    ...rail('floating', 0),
    placement: { kind: 'anchor', startMm: { x: 0, y: 400, z: 0 } },
  };
  const parts = [rail('left-rail', -280), floating, rail('right-rail', 280), crossmember];
  assert.deepEqual(unsupported(parts), ['left-rail', 'floating', 'right-rail', 'rear']);
});

test('a peripheral on a plate is supported through the plate', () => {
  const plate: PlatePart = {
    kind: 'plate',
    id: 'plate',
    name: 'Plate',
    widthMm: 200,
    depthMm: 150,
    sheetId: 'aluminium-5',
    normal: '+y',
    depthAxis: 'z',
    ownHoles: [],
    placement: {
      kind: 'attachment',
      parentId: 'left-rail',
      face: '+y',
      alongMm: 200,
      fromEnd: 'start',
    },
  };
  const wheelBase: PeripheralPart = {
    kind: 'peripheral',
    id: 'wheel-base',
    name: 'Wheel base',
    category: 'wheel-base',
    envelope: { widthMm: 150, heightMm: 120, depthMm: 180 },
    mountingPattern: { holes: [] },
    contactPoints: [],
    source: { kind: 'estimated', reference: 'test' },
    facing: '+z',
    placement: { kind: 'attachment', parentId: 'plate', face: '+y', alongMm: 75, fromEnd: 'start' },
  };
  assert.deepEqual(
    unsupported([rail('left-rail', -280), footUnder('left-rail'), plate, wheelBase]),
    [],
  );
  assert.deepEqual(unsupported([rail('left-rail', -280), plate, wheelBase]), [
    'left-rail',
    'plate',
    'wheel-base',
  ]);
});
