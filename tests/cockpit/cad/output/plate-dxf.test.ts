import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import { fastenWithBolts } from '../../../../src/cockpit/cad/history/fastening.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';
import { holesOfPlate } from '../../../../src/cockpit/cad/parts/plate-holes.ts';
import { plateDxf } from '../../../../src/cockpit/cad/output/plate-dxf.ts';
import {
  REFERENCE_PATTERN,
  referencePlate,
  referenceWheelBase,
  withPeripheral,
} from '../../../support/designs.ts';
import { readDxf, type DxfEntity } from '../../../support/dxf.ts';
import { ofKind } from '../../../support/lookups.ts';

function exported(history: readonly Operation[]) {
  const design = replayDesign(history);
  const plate = ofKind(design.resolved.get('part-2')?.part, 'plate');
  const holes = holesOfPlate(design, 'part-2');
  return { dxf: readDxf(plateDxf(plate, holes)), holes };
}

type Circle = Extract<DxfEntity, { type: 'CIRCLE' }>;
type Polyline = Extract<DxfEntity, { type: 'POLYLINE' }>;

const circles = (entities: readonly DxfEntity[]) =>
  entities.filter((entity): entity is Circle => entity.type === 'CIRCLE');
const polylines = (entities: readonly DxfEntity[]) =>
  entities.filter((entity): entity is Polyline => entity.type === 'POLYLINE');

test('the DXF is an R12 file with its entities and nothing a shop might cut but the plate', () => {
  const { dxf } = exported(referenceWheelBase());
  assert.equal(dxf.version, 'AC1009');
  assert.deepEqual(dxf.sections, ['HEADER', 'ENTITIES']);
  assert.deepEqual([...new Set(dxf.entities.map((entity) => entity.type))].sort(), [
    'CIRCLE',
    'POLYLINE',
  ]);
});

test('read back, the DXF rebuilds the outline of the reference plate from its bottom left corner', () => {
  const { dxf } = exported(referenceWheelBase());
  const [outline, ...others] = polylines(dxf.entities);
  assert.equal(others.length, 0);
  assert.deepEqual(outline, {
    type: 'POLYLINE',
    layer: '0',
    closed: true,
    vertices: [
      { x: 0, y: 0, bulge: 0 },
      { x: 200, y: 0, bulge: 0 },
      { x: 200, y: 150, bulge: 0 },
      { x: 0, y: 150, bulge: 0 },
    ],
  });
});

test('read back, the DXF rebuilds each hole of the plate as a circle where the drawing puts it', () => {
  const { dxf, holes } = exported(fastenWithBolts(referenceWheelBase(), 'part-2@part-1', 1));
  const rebuilt = circles(dxf.entities).map(({ x, y, radius }) =>
    toThousandths({ xMm: x - 100, yMm: y - 75, diameterMm: 2 * radius }),
  );
  assert.deepEqual(rebuilt, holes.map(toThousandths));
  // The reference pattern's four holes and the bolt in the rail's top slot.
  assert.equal(rebuilt.length, 5);
});

const thousandths = (valueMm: number) => Math.round(valueMm * 1000) / 1000 || 0;

const toThousandths = ({
  xMm,
  yMm,
  diameterMm,
}: {
  xMm: number;
  yMm: number;
  diameterMm: number;
}) => ({
  xMm: thousandths(xMm),
  yMm: thousandths(yMm),
  diameterMm: thousandths(diameterMm),
});

test('holes that coincide are cut once', () => {
  const twice = withPeripheral(referenceWheelBase(), 'part-2', 'generic-wheel-base', {
    mountingPattern: REFERENCE_PATTERN,
  });
  const { dxf, holes } = exported(twice);
  assert.equal(holes.length, 8);
  assert.equal(circles(dxf.entities).length, 4);
});

test('a slot is a closed polyline of two straight sides and two half circles', () => {
  let history = referenceWheelBase();
  history = addAdjustment(history, 'part-3');
  history = editAdjustment(history, 'part-3', { travelMm: 60 });
  const { dxf } = exported(history);
  assert.equal(circles(dxf.entities).length, 0);
  const [, firstSlot, ...otherSlots] = polylines(dxf.entities);
  assert.equal(otherSlots.length, 3);
  // The first hole, 160 mm from the left edge and 35 mm from the bottom, 6.5 mm across, slides
  // 60 mm up and down the page: its sides run 30 mm either way of its center, turning
  // anticlockwise, and a bulge of 1 is a half circle.
  assert.deepEqual(firstSlot, {
    type: 'POLYLINE',
    layer: '0',
    closed: true,
    vertices: [
      { x: 163.25, y: 5, bulge: 0 },
      { x: 163.25, y: 65, bulge: 1 },
      { x: 156.75, y: 65, bulge: 0 },
      { x: 156.75, y: 5, bulge: 1 },
    ],
  });
});

test('a plate without holes is its outline alone', () => {
  const { dxf } = exported(referencePlate());
  assert.equal(dxf.entities.length, 1);
});
