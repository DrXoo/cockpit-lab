import test from 'node:test';
import assert from 'node:assert/strict';
import { plateHoles } from '../../../../src/cockpit/cad/parts/plate.ts';
import {
  resolveAssembly,
  type PeripheralPart,
  type PlatePart,
} from '../../../../src/cockpit/cad/parts/assembly.ts';
import { holesOfPlate } from '../../../../src/cockpit/cad/parts/mounting.ts';

// Reference case from docs/mini-cad.md: a test case, not a manufacturer's pattern.
const referencePattern = {
  holes: [
    { xMm: -60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: 40, diameterMm: 6.5 },
    { xMm: -60, yMm: 40, diameterMm: 6.5 },
  ],
};
const referencePlate = { widthMm: 200, depthMm: 150, thicknessMm: 5, ownHoles: [] };

test('a peripheral mounted at the center of the reference plate puts its pattern there', () => {
  const holes = plateHoles(referencePlate, [
    { pattern: referencePattern, originXMm: 0, originYMm: 0 },
  ]);
  assert.deepEqual(holes, referencePattern.holes);
});

test('the holes follow the peripheral where it is mounted, and keep their diameter', () => {
  const holes = plateHoles(referencePlate, [
    { pattern: referencePattern, originXMm: 15, originYMm: -10 },
  ]);
  assert.deepEqual(holes, [
    { xMm: -45, yMm: -50, diameterMm: 6.5 },
    { xMm: 75, yMm: -50, diameterMm: 6.5 },
    { xMm: 75, yMm: 30, diameterMm: 6.5 },
    { xMm: -45, yMm: 30, diameterMm: 6.5 },
  ]);
});

test('the plate keeps its own holes beside those of mounted peripherals', () => {
  const ownHole = { xMm: 90, yMm: 0, diameterMm: 8.5 };
  const holes = plateHoles({ ...referencePlate, ownHoles: [ownHole] }, [
    { pattern: referencePattern, originXMm: 0, originYMm: 0 },
  ]);
  assert.deepEqual(holes, [ownHole, ...referencePattern.holes]);
});

test('in a design, a plate gets the holes of the peripherals mounted on it', () => {
  const plate: PlatePart = {
    kind: 'plate',
    id: 'plate',
    name: 'Reference plate',
    widthMm: referencePlate.widthMm,
    depthMm: referencePlate.depthMm,
    sheetId: 'aluminium-5',
    normal: '+y',
    depthAxis: 'z',
    ownHoles: [],
    placement: { kind: 'anchor', startMm: { x: 300, y: 200, z: 500 } },
  };
  const mountedAt = (alongMm: number, acrossMm: number): PeripheralPart => ({
    kind: 'peripheral',
    id: `device-${alongMm}`,
    name: 'Device',
    category: 'wheel-base',
    envelope: { widthMm: 150, heightMm: 60, depthMm: 100 },
    mountingPattern: referencePattern,
    contactPoints: [],
    source: { kind: 'estimated', reference: 'test case' },
    facing: '+z',
    placement: {
      kind: 'attachment',
      parentId: 'plate',
      face: '+y',
      alongMm,
      acrossMm,
      fromEnd: 'start',
    },
  });
  const centered = resolveAssembly([plate, mountedAt(75, 0)]);
  assert.deepEqual(holesOfPlate(centered, 'plate'), referencePattern.holes);
  const offCenter = resolveAssembly([plate, mountedAt(65, 15)]);
  assert.deepEqual(holesOfPlate(offCenter, 'plate'), [
    { xMm: -45, yMm: -50, diameterMm: 6.5 },
    { xMm: 75, yMm: -50, diameterMm: 6.5 },
    { xMm: 75, yMm: 30, diameterMm: 6.5 },
    { xMm: -45, yMm: 30, diameterMm: 6.5 },
  ]);
});
