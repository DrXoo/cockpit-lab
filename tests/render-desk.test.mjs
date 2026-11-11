import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { drawDesk, drawMonitor, drawArmReach } from '../src/render-desk.ts';
import { defaults, evaluate } from '../src/model.ts';

const render = (changes, drawing) => {
  const state = { ...defaults, ...changes };
  const evaluation = evaluate(state);
  const r = createRenderList();
  const result = drawing(r, state, evaluation);
  return { state, evaluation, r, result };
};
const desk = (changes = {}) => render(changes, (r, s, e) => drawDesk(r, ROOT, s, e));
const monitor = (changes = {}, options = { showHandles: false }) =>
  render(changes, (r, s, e) => drawMonitor(r, ROOT, s, e, options));
const boxes = (r) => r.primitives.filter((p) => p.kind === 'box');

test('without a desk nothing is drawn', () => {
  assert.deepEqual(desk({ deskEnabled: false }).r.primitives, []);
  assert.deepEqual(monitor({ deskEnabled: false }).r.primitives, []);
});

test('the tabletop is drawn in the desk frame, its top at desk height', () => {
  const { state, r } = desk();
  const [top] = boxes(r);
  assert.deepEqual(top.size, [state.deskDepth, 2.5, state.deskWidth]);
  assert.equal(top.position[1] + top.size[1] / 2, state.deskH);
  assert.deepEqual([top.position[0], top.position[2]], [0, 0]);
  assert.equal(top.material, 'wood');
});

test('the desk stands on two columns', () => {
  const { evaluation, r } = desk();
  const feet = boxes(r).filter((p) => p.size[0] === 66);
  assert.deepEqual(
    feet.map((p) => p.position[2]),
    [-evaluation.deskBounds.columnZ, evaluation.deskBounds.columnZ],
  );
});

test('the keyboard has five rows of twelve keys, the first one orange', () => {
  const { r } = desk({ keyboardEnabled: true });
  const keys = boxes(r).filter((p) => p.position[1] === 2.2);
  assert.equal(keys.length, 60);
  assert.equal(keys[0].material, 'orange');
  assert.ok(keys.slice(1).every((key) => key.material === 'fabric'));
});

test('objects on the mat sit on its surface', () => {
  const placed = desk({ matEnabled: true, keyboardEnabled: true });
  const onMat = placed.evaluation.mouseOnMat;
  const groups = placed.r.primitives.filter((p) => p.kind === 'group');
  const heights = groups.map((g) => g.position[1] - placed.state.deskH);
  assert.equal(heights[0], 0, 'the mat itself lies on the desk');
  if (onMat) assert.ok(heights.some((h) => Math.abs(h - 0.35) < 1e-9));
});

test('disabled desktop objects are not drawn', () => {
  const groups = (changes) => desk(changes).r.primitives.filter((p) => p.kind === 'group').length;
  const all = { keyboardEnabled: true, mouseEnabled: true, pcEnabled: true, matEnabled: true };
  assert.equal(groups(all), 4);
  assert.equal(groups({ ...all, pcEnabled: false }), 3);
});

test('a clamp grips the desk edge and a grommet goes through it', () => {
  const clamp = monitor({ clampMount: 'clamp' }).r.primitives;
  const grommet = monitor({ clampMount: 'grommet' }).r.primitives;
  assert.ok(clamp.some((p) => p.kind === 'box' && p.size[0] === 2 && p.size[1] === 8));
  assert.ok(grommet.some((p) => p.kind === 'cylinder' && p.radius === 3.8));
  assert.ok(!grommet.some((p) => p.kind === 'box' && p.size[0] === 2 && p.size[1] === 8));
});

test('the screen faces the monitor angle', () => {
  const { evaluation, r } = monitor();
  const screen = boxes(r).find((p) => p.material === 'screen');
  const holder = r.primitives.find((p) => p.kind === 'group' && p.id === screen.parent);
  assert.ok(Math.abs(holder.rotation[1] - (evaluation.monitorAngle * Math.PI) / 180) < 1e-12);
});

test('an arm that cannot reach the monitor shows the gap as an orange dashed line', () => {
  const warningSpec = (r, line) =>
    r.primitives.find((p) => p.kind === 'material' && p.id === line.material)?.spec;
  const gaps = (r) =>
    r.primitives.filter((p) => p.kind === 'line' && warningSpec(r, p)?.kind === 'dashed');
  const far = monitor({ armReach: 40, clampZ: defaults.clampZ + 80 });
  assert.equal(far.evaluation.armPose.reachable, false);
  const [gap] = gaps(far.r);
  assert.deepEqual(warningSpec(far.r, gap), {
    kind: 'dashed',
    color: 0xc26a46,
    dashSize: 2,
    gapSize: 2,
  });
  assert.equal(monitor().evaluation.armPose.reachable, true);
  assert.deepEqual(gaps(monitor().r), []);
});

test('the arm joints become handles only while editing the arm', () => {
  const idle = monitor();
  assert.deepEqual(idle.r.labels, []);
  assert.deepEqual(
    idle.result.map((h) => h.id),
    ['elbow', 'end'],
  );
  const editing = monitor({}, { showHandles: true });
  assert.deepEqual(
    editing.r.labels.map((l) => [l.text, l.armHandle, l.className]),
    [
      ['CODO', true, 'arm-joint-label'],
      ['VESA', true, 'arm-joint-label'],
    ],
  );
});

test('the reach circle around the anchor is only shown in the top view', () => {
  const reach = (view) =>
    render({}, (r, s, e) => drawArmReach(r, ROOT, s, e, { visible: view === 'top' })).r;
  const top = reach('top');
  const [group] = top.primitives;
  assert.equal(group.visible, true);
  assert.equal(reach('iso').primitives[0].visible, false);
  const circle = top.primitives.filter((p) => p.kind === 'line')[1];
  assert.equal(circle.points.length, 65);
  assert.equal(circle.material, 'dashed');
});
