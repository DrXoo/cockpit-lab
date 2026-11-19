import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT, type RenderList } from '../src/render-list.ts';
import type { RoomConfig } from '../src/config.ts';
import type { CockpitEvaluation } from '../src/evaluate.ts';
import { ofKind } from './support/lookups.ts';
import {
  drawDeskDimensions,
  drawLayoutSelection,
  type LayoutSelection,
} from '../src/render-annotations.ts';
import { defaults, evaluate } from '../src/model.ts';

type Drawing = (r: RenderList, s: RoomConfig, e: CockpitEvaluation) => void;

const annotate = (changes: Partial<RoomConfig>, drawing: Drawing) => {
  const state = { ...defaults, ...changes };
  const evaluation = evaluate(state);
  const r = createRenderList();
  drawing(r, state, evaluation);
  return { state, evaluation, r };
};

test('the desk is measured and named in world coordinates', () => {
  const { state, r } = annotate({}, (r, s, e) => drawDeskDimensions(r, ROOT, s, e));
  assert.deepEqual(
    r.labels.map((l) => l.text),
    [`${state.deskWidth} cm`, `${state.deskDepth} cm`, 'DESK'],
  );
});

test('the selected item is outlined in the plan views while editing the layout', () => {
  const select = (options: LayoutSelection) =>
    annotate({}, (r, s, e) => drawLayoutSelection(r, ROOT, s, e, options));
  const desk = select({ view: 'top', layoutEditing: true, layoutTarget: 'desk' });
  const line = ofKind(
    desk.r.primitives.find((p) => p.kind === 'line'),
    'line',
  );
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
