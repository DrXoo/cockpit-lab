import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT, labelShownIn } from '../src/render-list.ts';

test('primitives keep the order in which they were drawn, materials included', () => {
  const r = createRenderList();
  const wall = r.material({ kind: 'flat', color: '#b9c2ae', opacity: 0.85 });
  r.box(10, 20, 7, 1, 2, 3, wall, ROOT);
  r.line(
    [
      [0, 0, 0],
      [1, 0, 0],
    ],
    'dim',
    ROOT,
  );
  assert.deepEqual(
    r.primitives.map((p) => p.kind),
    ['material', 'box', 'line'],
  );
  assert.equal(r.primitives[1].material, wall);
});

test('groups nest drawings and carry their own placement', () => {
  const r = createRenderList();
  const pedals = r.group(ROOT, { position: [0, 30, 90], rotation: [-0.2, 0, 0] });
  const pedal = r.box(7, 2, 22, 0, 2, 0, 'dark', pedals);
  assert.notEqual(pedals, ROOT);
  assert.equal(pedal.parent, pedals);
  const group = r.primitives.find((p) => p.kind === 'group');
  assert.deepEqual(group.position, [0, 30, 90]);
  assert.equal(group.visible, true);
});

test('a drawing can be adjusted after it is placed, like a rotated wheel', () => {
  const r = createRenderList();
  const wheel = r.cylinder(3.3, 3.5, 0, 3.4, 10, 'rubber', ROOT);
  wheel.rotation = [0, 0, Math.PI / 2];
  assert.deepEqual(r.primitives[0].rotation, [0, 0, Math.PI / 2]);
});

test('a dimension draws its line, a tick at each end and a centred label', () => {
  const r = createRenderList();
  const label = r.dimension([0, 0.8, 0], [0, 0.8, 140], '140 cm', [-2, 0, 0], ROOT);
  const lines = r.primitives.filter((p) => p.kind === 'line');
  assert.equal(lines.length, 3);
  // Along Z the ticks cross the line along X.
  assert.deepEqual(lines[1].points, [
    [-2.2, 0.7000000000000001, 0],
    [2.2, 0.9, 0],
  ]);
  assert.equal(label.text, '140 cm');
  assert.deepEqual(label.position, { x: -2, y: 0.8, z: 70 });
  assert.deepEqual(r.labels, [label]);
});

test('labels for objects are told apart from measurements', () => {
  const r = createRenderList();
  const name = r.label('DESK', 1, 2, 3, true);
  const measure = r.label('0,0', 0, 0.8, -8);
  assert.equal(name.object, true);
  assert.equal(measure.object, false);
});

test('each label belongs to the views it describes', () => {
  const label = (flags) => ({ text: 'x', position: { x: 0, y: 0, z: 0 }, object: false, ...flags });
  assert.equal(labelShownIn(label({}), 'iso'), true);
  assert.equal(labelShownIn(label({ object: true }), 'side'), false);
  assert.equal(labelShownIn(label({ notSide: true }), 'side'), false);
  assert.equal(labelShownIn(label({ rigLabel: true }), 'desk'), false);
  assert.equal(labelShownIn(label({ topOnly: true }), 'top'), true);
  assert.equal(labelShownIn(label({ topOnly: true }), 'iso'), false);
  assert.equal(labelShownIn(label({ sideOnly: true }), 'side'), true);
  assert.equal(labelShownIn(label({ sideOnly: true }), 'top'), false);
  assert.equal(labelShownIn(label({ armHandle: true }), 'desk'), true);
  assert.equal(labelShownIn(label({ armHandle: true }), 'iso'), false);
});
