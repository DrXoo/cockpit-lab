import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { drawHandleStems, handleBallMm } from '../src/render-handles.ts';

const endHandle = {
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
  const rounded = (values) => values.map((value) => Math.round(value * 1000) / 1000);
  assert.deepEqual(
    r.primitives.map((stem) => [
      stem.kind,
      rounded(stem.size),
      rounded(stem.position),
      stem.material,
    ]),
    [['box', [0.3, 0.3, 4], [0, 2, 102], 'hover']],
  );
});
