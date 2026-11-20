import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aboveOutline,
  arrowLengthPx,
  besidePoint,
  clearOfCenter,
} from '../../src/scene/overlay-layout.ts';

const view = { width: 400, height: 300 };
const box = { width: 50, height: 20 };
const right = { x: 1, y: 0 };

test('an arrow has its full length unless a ball lies ahead of it', () => {
  assert.equal(arrowLengthPx({ x: 0, y: 0 }, right, []), 48);
  assert.equal(arrowLengthPx({ x: 0, y: 0 }, right, [{ x: -30, y: 0 }]), 48, 'behind it');
  assert.equal(arrowLengthPx({ x: 0, y: 0 }, right, [{ x: 60, y: 20 }]), 48, 'beside its line');
});

test('an arrow stops short of a ball ahead of it, but is never shorter than an arrow can be', () => {
  assert.equal(arrowLengthPx({ x: 0, y: 0 }, right, [{ x: 60, y: 0 }]), 38);
  assert.equal(arrowLengthPx({ x: 0, y: 0 }, right, [{ x: 40, y: 0 }]), 24);
});

test('a joint marker away from the center of the selected part stays where it is', () => {
  const at = { x: 50, y: 0 };
  assert.equal(clearOfCenter(at, { x: 0, y: 0 }, [right]), at);
});

test('a joint marker on the center moves out to the side its arrows leave most room on', () => {
  const moved = clearOfCenter({ x: 5, y: 0 }, { x: 0, y: 0 }, [right, { x: 0, y: 1 }]);
  assert.ok(moved.x < 0 && moved.y < 0, 'away from both arrows');
  assert.equal(Math.round(Math.hypot(moved.x, moved.y)), 22);
});

test('an element kept beside a point goes to its right, centered on it', () => {
  assert.deepEqual(besidePoint({ x: 100, y: 100 }, box, view, null), { x: 116, y: 90 });
});

test('an element kept beside a point goes to its left when the right would leave the view', () => {
  assert.deepEqual(besidePoint({ x: 380, y: 100 }, box, view, null), { x: 314, y: 90 });
});

test('an element keeps clear of a point on the right of it, when it fits on the left', () => {
  assert.deepEqual(besidePoint({ x: 100, y: 100 }, box, view, 150), { x: 34, y: 90 });
  assert.deepEqual(besidePoint({ x: 40, y: 100 }, box, view, 100), { x: 56, y: 90 });
});

test('an element kept beside a point stays whole within the view', () => {
  assert.deepEqual(besidePoint({ x: 100, y: 2 }, box, view, null), { x: 116, y: 8 });
  assert.deepEqual(besidePoint({ x: 100, y: 299 }, box, view, null), { x: 116, y: 272 });
});

test('an element kept above an outline is centered over it', () => {
  const outline = [
    { x: 100, y: 100 },
    { x: 200, y: 150 },
  ];
  assert.deepEqual(aboveOutline(outline, box, view), { x: 125, y: 64 });
});

test('an element goes below the outline when there is no room above it', () => {
  const outline = [
    { x: 100, y: 20 },
    { x: 200, y: 150 },
  ];
  assert.deepEqual(aboveOutline(outline, box, view), { x: 125, y: 166 });
});
