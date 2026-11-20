import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/scene/render-list.ts';
import { drawHandleStems, handleBallMm } from '../src/render-handles.ts';
import type { Handle } from '../src/cad/handles.ts';
import { ofKind } from './support/lookups.ts';

const endHandle: Handle = {
  kind: 'end',
  id: 'part-1:end',
  partId: 'part-1',
  end: 'end',
  pointMm: { x: 0, y: 20, z: 1000 },
  outwardMm: { x: 0, y: 0, z: 1 },
};

test('a handle stands off the end of its profile, along its length', () => {
  assert.deepEqual(handleBallMm(endHandle), { x: 0, y: 20, z: 1040 });
});

test('a thin stem joins each handle to the end it changes', () => {
  const r = createRenderList();
  drawHandleStems(r, ROOT, [endHandle]);
  const rounded = (values: readonly number[]) =>
    values.map((value) => Math.round(value * 1000) / 1000);
  assert.deepEqual(
    r.primitives.map((stem) => {
      assert.equal(stem.kind, 'box');
      return [stem.kind, rounded(stem.size), rounded(stem.position), stem.material];
    }),
    [['box', [0.3, 0.3, 4], [0, 2, 102], 'hover']],
  );
});

test('a move handle sits at the center of its part, with no stem', () => {
  const move: Handle = {
    kind: 'move',
    id: 'part-1:move:x',
    partId: 'part-1',
    axis: 'x',
    pointMm: { x: 0, y: 20, z: 500 },
    outwardMm: { x: 1, y: 0, z: 0 },
  };
  assert.deepEqual(handleBallMm(move), { x: 0, y: 20, z: 500 });
  const r = createRenderList();
  drawHandleStems(r, ROOT, [move]);
  assert.equal(r.primitives.length, 0);
});

test('a travel handle sits at the center of its part, on a line along its travel with its center marked', () => {
  const travel: Handle = {
    kind: 'travel',
    id: 'part-2:travel',
    partId: 'part-2',
    axis: 'z',
    pointMm: { x: 0, y: 50, z: 520 },
    outwardMm: { x: 0, y: 0, z: 1 },
    travel: {
      centerMm: { x: 0, y: 50, z: 500 },
      fromMm: { x: 0, y: 50, z: 450 },
      toMm: { x: 0, y: 50, z: 550 },
    },
  };
  assert.deepEqual(handleBallMm(travel), travel.pointMm);
  const r = createRenderList();
  drawHandleStems(r, ROOT, [travel]);
  const lines = r.primitives.filter((shape) => shape.kind === 'line');
  assert.deepEqual(
    lines.map((line) => line.points),
    [
      [
        [0, 5, 45],
        [0, 5, 55],
      ],
      [
        [0, 3.5, 50],
        [0, 6.5, 50],
      ],
    ],
  );
  const { spec } = ofKind(
    r.primitives.find((shape) => shape.kind === 'material'),
    'material',
  );
  assert.equal(spec.kind, 'dashed');
  assert.equal(spec.onTop, true, 'drawn over the parts it lies in');
});
