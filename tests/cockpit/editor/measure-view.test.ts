import test from 'node:test';
import assert from 'node:assert/strict';
import { measureReadout } from '../../../src/cockpit/editor/measure-view.ts';
import type { Measurement } from '../../../src/cockpit/cad/analysis/measure.ts';

const at = { x: 0, y: 0, z: 0 };

test('the readout asks for the first point, then the second', () => {
  assert.match(measureReadout(0, null), /Click a point on a part/);
  assert.match(measureReadout(1, null), /Click a second point/);
});

test('a gap is read as the distance between the faces', () => {
  const gap: Measurement = { kind: 'gap', gapMm: 260, fromMm: at, toMm: at };
  assert.equal(measureReadout(2, gap), 'Gap between the faces: 260 mm');
});

test('offsets are read along each axis with the way they go, as the driver sees it', () => {
  const offsets: Measurement = {
    kind: 'offsets',
    offsetMm: { x: -295.25, y: 0, z: 350 },
    fromMm: at,
    toMm: at,
  };
  assert.equal(
    measureReadout(2, offsets),
    'From the first point: X 295.3 mm to the right · Y 0 mm · Z 350 mm to the front',
  );
  const up: Measurement = {
    kind: 'offsets',
    offsetMm: { x: 10, y: 40, z: -5 },
    fromMm: at,
    toMm: at,
  };
  assert.equal(
    measureReadout(2, up),
    'From the first point: X 10 mm to the left · Y 40 mm up · Z 5 mm to the back',
  );
});
