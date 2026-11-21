import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../../../src/scene/render-list.ts';
import type { SceneBounds } from '../../../src/scene/camera.ts';
import { ofKind } from '../../support/lookups.ts';
import { boundsWithFrontArrow, drawFrontArrow } from '../../../src/cockpit/render/front-arrow.ts';

/** A design 60 cm wide, from x −20 to 40, and 120 cm long, standing on a floor 5 cm up. */
const BOUNDS: SceneBounds = {
  left: -20,
  right: 40,
  back: -30,
  front: 90,
  vertical: { bottom: 5, top: 80 },
};

const drawnArrow = (bounds: SceneBounds) => {
  const r = createRenderList();
  drawFrontArrow(r, ROOT, bounds);
  return r;
};
const arrowOutline = (bounds: SceneBounds) =>
  ofKind(
    drawnArrow(bounds).primitives.find((p) => p.kind === 'fill'),
    'fill',
  ).outline;

test('the front arrow lies on the floor ahead of the design, pointing to +Z', () => {
  const r = drawnArrow(BOUNDS);
  const fill = ofKind(
    r.primitives.find((p) => p.kind === 'fill'),
    'fill',
  );
  const zs = fill.outline.map((point) => point.z);
  assert.ok(Math.min(...zs) > BOUNDS.front, 'the arrow starts ahead of the front of the design');
  const tip = fill.outline.find((point) => point.z === Math.max(...zs));
  assert.equal(tip?.x, 10, 'its tip is centered across the design');
  assert.ok(fill.height > 5 && fill.height < 6, 'it lies just above the floor');
});

test('the front arrow is narrower than it is long, so it reads as a direction', () => {
  const outline = arrowOutline(BOUNDS);
  const xs = outline.map((point) => point.x);
  const zs = outline.map((point) => point.z);
  assert.ok(Math.max(...zs) - Math.min(...zs) > Math.max(...xs) - Math.min(...xs));
});

test('the front arrow is labeled at its tip and shown with dimensions hidden', () => {
  const r = drawnArrow(BOUNDS);
  assert.equal(r.labels.length, 1);
  const [label] = r.labels;
  assert.equal(label?.text, 'Front');
  assert.equal(label?.alwaysShown, true);
  assert.equal(label?.position.x, 10);
  assert.ok((label?.position.z ?? 0) > Math.max(...arrowOutline(BOUNDS).map((p) => p.z)));
});

test('a design without a known floor puts its arrow at height zero', () => {
  const { vertical: _floor, ...flat } = BOUNDS;
  const r = drawnArrow(flat);
  const fill = ofKind(
    r.primitives.find((p) => p.kind === 'fill'),
    'fill',
  );
  assert.ok(fill.height > 0 && fill.height < 1);
});

test('the bounds a view frames reach past the arrow and its label, the design still centered', () => {
  const r = drawnArrow(BOUNDS);
  const framed = boundsWithFrontArrow(BOUNDS);
  const labelZ = r.labels[0]?.position.z ?? Infinity;
  assert.ok(framed.front > labelZ, 'the label is inside the frame');
  assert.equal(framed.back + framed.front, BOUNDS.back + BOUNDS.front);
  assert.deepEqual({ ...framed, back: BOUNDS.back, front: BOUNDS.front }, BOUNDS);
});
