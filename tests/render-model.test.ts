import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModel } from '../src/render-model.ts';
import { ROOT } from '../src/render-list.ts';
import { defaults, evaluate } from '../src/model.ts';
import { degToRad } from '../src/geometry.ts';
import { NOTHING_AROUND } from '../src/cockpit-editor-view.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import {
  addAnchoredProfile,
  draftGrowth,
  editDraft,
  editProfile,
  replayHistory,
} from '../src/cad/history.ts';
import { partHandles } from '../src/cad/handles.ts';

const options = {
  view: 'iso',
  layoutEditing: false,
  layoutTarget: 'desk',
  roomFloor: '#e5e9dd',
};
const render = (changes = {}, extra = {}) => {
  const state = { ...defaults, ...changes };
  return { state, model: renderModel(state, evaluate(state), { ...options, ...extra }) };
};
const topGroups = (model) =>
  model.primitives.filter((p) => p.kind === 'group' && p.parent === ROOT);

test('the desk is drawn in its own placement', () => {
  const { state, model } = render({ deskAngle: -15 });
  const [, desk] = topGroups(model);
  assert.deepEqual(desk.position, [state.deskX, 0, state.deskZ]);
  assert.equal(desk.rotation[1], degToRad(-15));
});

test('all measurements share one group that can be hidden without rebuilding', () => {
  const { model } = render({ roomEnabled: true });
  const groups = model.primitives.filter((p) => p.role === 'dimensions');
  assert.equal(groups.length, 1);
  const dimensions = groups[0].id;
  const measured = model.primitives.filter((p) => p.kind === 'group' && p.parent === dimensions);
  assert.ok(measured.length >= 2, 'desk and room measurements');
});

test('a hidden room is still a group, so the views can rely on it', () => {
  const { model } = render({ roomEnabled: false });
  const room = topGroups(model).at(-1);
  assert.equal(room.visible, false);
});

test('the arm handles are always returned, but only drawn while editing the arm', () => {
  const idle = render().model;
  assert.deepEqual(
    idle.armHandles.map((h) => h.id),
    ['elbow', 'end'],
  );
  assert.ok(!idle.labels.some((l) => l.armHandle));
  const editing = render({}, { view: 'desk', layoutEditing: true, layoutTarget: 'arm' }).model;
  assert.equal(editing.labels.filter((l) => l.armHandle).length, 2);
});

test('no desk means no monitor and no arm handles', () => {
  assert.deepEqual(render({ deskEnabled: false }).model.armHandles, []);
});

test('a cockpit design shown on its own is drawn at the origin, with its selected part', () => {
  const history = addAnchoredProfile(addAnchoredProfile([]).history).history;
  const cockpit = { resolved: resolveAssembly(replayHistory(history)), selectedPartId: 'part-2' };
  const { model } = render(NOTHING_AROUND, { cockpit });
  const bars = model.primitives.filter(
    (p) => p.kind === 'box' && p.parent === ROOT && ['silver', 'selected'].includes(p.material),
  );
  assert.deepEqual(
    bars.map((bar) => bar.material),
    ['silver', 'selected'],
  );
  assert.deepEqual(bars[0].position, [0, 2, 25]);
});

test('the selected part shows its length with the other dimensions, which can be hidden', () => {
  const history = addAnchoredProfile([]).history;
  const cockpit = { resolved: resolveAssembly(replayHistory(history)), selectedPartId: 'part-1' };
  const { model } = render(NOTHING_AROUND, { cockpit });
  const dimensions = model.primitives.find((p) => p.kind === 'group' && p.role === 'dimensions');
  const measured = model.primitives.filter((p) => p.kind === 'line' && p.material === 'dim');
  assert.ok(measured.length > 0);
  assert.ok(measured.every((line) => line.parent === dimensions.id));
  assert.deepEqual(
    model.labels.map((label) => label.text),
    ['500 mm'],
  );
});

test('a measurement is drawn apart from the dimensions, so hiding them keeps it', () => {
  const history = addAnchoredProfile([]).history;
  const at = { x: 0, y: 40, z: 100 };
  const cockpit = {
    resolved: resolveAssembly(replayHistory(history)),
    selectedPartId: null,
    measure: { points: [at], measurement: null },
  };
  const { model } = render(NOTHING_AROUND, { cockpit });
  const marker = model.primitives.find((p) => p.kind === 'sphere');
  assert.equal(marker.parent, ROOT);
});

test('the handles of the selected part are drawn with the design, as stems to their balls', () => {
  const history = addAnchoredProfile([]).history;
  const handles = partHandles(history, 'part-1');
  const cockpit = { resolved: resolveAssembly(replayHistory(history)), selectedPartId: 'part-1' };
  const stems = (drawing) =>
    render(NOTHING_AROUND, { cockpit: drawing }).model.primitives.filter(
      (p) => p.kind === 'box' && p.material === 'hover',
    );
  assert.equal(stems(cockpit).length, 0);
  assert.equal(stems({ ...cockpit, handles }).length, 2, 'the two ends; a move handle has none');
});

test('a profile being placed shows its own length, even with dimensions hidden', () => {
  const rail = editProfile(addAnchoredProfile([]).history, 'part-1', { lengthMm: 1000 });
  const growing = editDraft(rail, draftGrowth(rail, 'part-1'), { lengthMm: 300 });
  const cockpit = {
    resolved: resolveAssembly(replayHistory([...rail, growing])),
    selectedPartId: 'part-1',
    placedPartId: growing.partId,
  };
  const { model } = render(NOTHING_AROUND, { cockpit });
  const length = model.labels.find((label) => label.measures === 'part-length');
  assert.equal(length.text, '300 mm');
  assert.equal(length.alwaysShown, true);
  assert.equal(model.labels.filter((label) => label.measures === 'part-length').length, 1);
});
