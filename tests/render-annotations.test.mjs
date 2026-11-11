import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import {
  drawRigDimensions,
  drawDeskDimensions,
  drawSetupLabels,
  drawLayoutSelection,
} from '../src/render-annotations.ts';
import { defaults, evaluate, transformPoint } from '../src/model.ts';

const annotate = (changes, drawing) => {
  const state = { ...defaults, ...changes };
  const evaluation = evaluate(state);
  const r = createRenderList();
  drawing(r, state, evaluation);
  return { state, evaluation, r };
};
const near = (a, b) =>
  Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;

test('rig measurements follow the rig and are labelled in world coordinates', () => {
  const { state, evaluation, r } = annotate({ cockpitAngle: 90, cockpitX: 50 }, (r, s, e) =>
    drawRigDimensions(r, ROOT, s, e, 'iso'),
  );
  const [group] = r.primitives;
  assert.deepEqual(group.position, [50, 0, state.cockpitZ]);
  const length = r.labels.find((l) => l.text === `${state.length} cm`);
  const local = { x: -state.width / 2 - 20 - 2, y: 0.8, z: state.length / 2 };
  assert.ok(near(length.position, transformPoint(local, evaluation.rigPose)));
  assert.ok(r.labels.every((l) => l.rigLabel));
});

test('heights are measured only in the side view', () => {
  const side = (view) =>
    annotate({ wheel: true }, (r, s, e) => drawRigDimensions(r, ROOT, s, e, view)).r;
  const heights = side('side').labels.filter((l) => l.sideOnly);
  assert.deepEqual(
    heights.map((l) => l.text.split(' ')[0]),
    ['Asiento', 'Volante', 'Base'],
  );
  const hiddenGroup = side('iso').primitives.filter((p) => p.kind === 'group')[1];
  assert.equal(hiddenGroup.visible, false);
});

test('without a cockpit the rig has no measurements', () => {
  const { r } = annotate({ cockpitEnabled: false }, (r, s, e) =>
    drawRigDimensions(r, ROOT, s, e, 'iso'),
  );
  assert.deepEqual(r.labels, []);
});

test('the desk is measured and named in world coordinates', () => {
  const { state, r } = annotate({}, (r, s, e) => drawDeskDimensions(r, ROOT, s, e));
  assert.deepEqual(
    r.labels.map((l) => l.text),
    [`${state.deskWidth} cm`, `${state.deskDepth} cm`, 'ESCRITORIO'],
  );
});

test('the shifter is tagged with the side of the pilot it is on', () => {
  const tag = (changes) =>
    annotate({ cockpitEnabled: true, monitorMode: 'desk', ...changes }, (r, s, e) =>
      drawSetupLabels(r, s, e),
    ).r.labels;
  assert.deepEqual(
    tag({ shifter: true, handbrake: true, drivingSide: 'left' }).map((l) => l.text),
    ['CAMBIO + FRENO · IZQUIERDA DEL PILOTO'],
  );
  assert.equal(
    tag({ shifter: false, handbrake: true, drivingSide: 'right' })[0].text,
    'FRENO · DERECHA DEL PILOTO',
  );
  assert.deepEqual(tag({ shifter: false, handbrake: false }), []);
});

test('a monitor shared with the cockpit is labelled with its size', () => {
  const { state, r } = annotate(
    { shifter: false, handbrake: false, monitorMode: 'cockpit' },
    (r, s, e) => drawSetupLabels(r, s, e),
  );
  assert.deepEqual(
    r.labels.map((l) => l.text),
    [`${state.monitorInches}″ · MONITOR COMPARTIDO`],
  );
});

test('the selected item is outlined in the plan views while editing the layout', () => {
  const select = (options) =>
    annotate({}, (r, s, e) => drawLayoutSelection(r, ROOT, s, e, options));
  const desk = select({ view: 'top', layoutEditing: true, layoutTarget: 'desk' });
  const line = desk.r.primitives.find((p) => p.kind === 'line');
  const polygon = desk.evaluation.deskPolygon;
  assert.equal(line.points.length, polygon.length + 1);
  assert.deepEqual(line.points[0], [polygon[0].x, 1.5, polygon[0].z]);
  assert.deepEqual(line.points.at(-1), line.points[0]);
  assert.deepEqual(
    select({ view: 'iso', layoutEditing: true, layoutTarget: 'desk' }).r.primitives,
    [],
  );
  assert.deepEqual(
    select({ view: 'top', layoutEditing: false, layoutTarget: 'desk' }).r.primitives,
    [],
  );
});

test('a selected desktop object is named in the top view', () => {
  const keyboard = annotate({ keyboardEnabled: true }, (r, s, e) =>
    drawLayoutSelection(r, ROOT, s, e, {
      view: 'top',
      layoutEditing: true,
      layoutTarget: 'keyboard',
    }),
  );
  assert.deepEqual(
    keyboard.r.labels.map((l) => [l.text, l.offsetY]),
    [['KEYBOARD', -24]],
  );
});
