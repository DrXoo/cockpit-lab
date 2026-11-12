import test from 'node:test';
import assert from 'node:assert/strict';
import { renderModel } from '../src/render-model.ts';
import { ROOT } from '../src/render-list.ts';
import { defaults, evaluate } from '../src/model.ts';
import { degToRad } from '../src/geometry.ts';

const options = {
  view: 'iso',
  person: false,
  layoutEditing: false,
  layoutTarget: 'cockpit',
  roomFloor: '#e5e9dd',
};
const render = (changes = {}, extra = {}) => {
  const state = { ...defaults, ...changes };
  return { state, model: renderModel(state, evaluate(state), { ...options, ...extra }) };
};
const topGroups = (model) =>
  model.primitives.filter((p) => p.kind === 'group' && p.parent === ROOT);

test('the rig and the desk are drawn in their own placement', () => {
  const { state, model } = render({ cockpitAngle: 30, deskAngle: -15 });
  const [rig, , desk] = topGroups(model);
  assert.deepEqual(rig.position, [state.cockpitX, 0, state.cockpitZ]);
  assert.equal(rig.rotation[1], degToRad(30));
  assert.deepEqual(desk.position, [state.deskX, 0, state.deskZ]);
  assert.equal(desk.rotation[1], degToRad(-15));
});

test('all measurements share one group that can be hidden without rebuilding', () => {
  const { model } = render({ roomEnabled: true });
  const groups = model.primitives.filter((p) => p.role === 'dimensions');
  assert.equal(groups.length, 1);
  const dimensions = groups[0].id;
  const measured = model.primitives.filter((p) => p.kind === 'group' && p.parent === dimensions);
  assert.ok(measured.length >= 2, 'rig and desk measurements');
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
