import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  editProfile,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayHistory,
} from '../src/cad/history.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';

const withProfiles = (count) => {
  let history = [];
  for (let i = 0; i < count; i++) history = addAnchoredProfile(history).history;
  return history;
};
const boxesOf = (history) => [...resolveAssembly(replayHistory(history)).values()];

test('the first operation adds an anchored 40 × 40 profile lying on the floor, front to back', () => {
  const { history, partId } = addAnchoredProfile([]);
  assert.equal(history.length, 1);
  assert.equal(partId, 'part-1');
  assert.deepEqual(history[0], {
    kind: 'add-anchored-profile',
    id: 'op-1',
    partId: 'part-1',
    name: '40 × 40 profile 1',
    systemId: 'motedis-40-i-slot-8',
    sectionId: '40x40',
    axis: 'z',
    heightAxis: 'y',
    lengthMm: 500,
    startMm: { x: 0, y: 20, z: 0 },
  });
  const [resolved] = boxesOf(history);
  assert.deepEqual(resolved.box, { min: { x: -20, y: 0, z: 0 }, max: { x: 20, y: 40, z: 500 } });
});

test('replaying the history gives one anchored profile per operation, with its values', () => {
  const [part] = replayHistory(withProfiles(1));
  assert.deepEqual(part, {
    kind: 'profile',
    id: 'part-1',
    name: '40 × 40 profile 1',
    systemId: 'motedis-40-i-slot-8',
    sectionId: '40x40',
    axis: 'z',
    heightAxis: 'y',
    lengthMm: 500,
    placement: { kind: 'anchor', startMm: { x: 0, y: 20, z: 0 } },
  });
});

test('a new profile lies beside the parts the design has, with the next identifiers and number', () => {
  const history = withProfiles(3);
  assert.deepEqual(
    history.map((operation) => [operation.id, operation.partId, operation.name]),
    [
      ['op-1', 'part-1', '40 × 40 profile 1'],
      ['op-2', 'part-2', '40 × 40 profile 2'],
      ['op-3', 'part-3', '40 × 40 profile 3'],
    ],
  );
  const boxes = boxesOf(history).map((resolved) => resolved.box);
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].min.x > boxes[i - 1].max.x);
});

test('replaying a saved history gives the same parts, identifiers and dimensions', () => {
  const history = editProfile(withProfiles(2), 'part-2', { sectionId: '40x80', lengthMm: 720 });
  const saved = JSON.parse(JSON.stringify(history));
  assert.deepEqual(replayHistory(saved), replayHistory(history));
  assert.deepEqual(boxesOf(saved), boxesOf(history));
});

test('editing a profile changes the operation that made it, and nothing else', () => {
  const history = withProfiles(2);
  const edited = editProfile(history, 'part-1', {
    name: 'Left rail',
    sectionId: '40x80',
    lengthMm: 1200,
    startMm: { x: -280, y: 40, z: 0 },
  });
  assert.equal(edited.length, 2);
  assert.deepEqual(edited[1], history[1]);
  assert.deepEqual(operationMaking(edited, 'part-1'), {
    ...history[0],
    name: 'Left rail',
    sectionId: '40x80',
    lengthMm: 1200,
    startMm: { x: -280, y: 40, z: 0 },
  });
  assert.equal(history[0].name, '40 × 40 profile 1', 'the history it was given is not changed');
  const [rail] = boxesOf(edited);
  assert.deepEqual(rail.box, { min: { x: -300, y: 0, z: 0 }, max: { x: -260, y: 80, z: 1200 } });
});

test('a typed name is cleaned, and an empty one keeps the name it had', () => {
  const history = withProfiles(1);
  assert.equal(editProfile(history, 'part-1', { name: '  <b>Rail</b> ' })[0].name, 'bRail/b');
  assert.equal(editProfile(history, 'part-1', { name: '   ' })[0].name, '40 × 40 profile 1');
});

test('turning a profile to run along its section height turns the section with it', () => {
  const lying = editProfile(withProfiles(1), 'part-1', { sectionId: '40x80' });
  const upright = editProfile(lying, 'part-1', { axis: 'y' });
  assert.equal(upright[0].axis, 'y');
  assert.equal(upright[0].heightAxis, 'z');
  const across = editProfile(lying, 'part-1', { axis: 'x' });
  assert.equal(across[0].heightAxis, 'y', 'a height across the new axis stays');
});

test('values a profile cannot have are rejected, naming what is wrong', () => {
  const history = withProfiles(1);
  const edit = (changes) => () => editProfile(history, 'part-1', changes);
  assert.throws(edit({ lengthMm: MIN_PROFILE_LENGTH_MM - 1 }), /length/);
  assert.throws(edit({ lengthMm: MAX_PROFILE_LENGTH_MM + 1 }), /length/);
  assert.throws(edit({ lengthMm: Number.NaN }), /length/);
  assert.throws(edit({ startMm: { x: MAX_POSITION_MM + 1, y: 20, z: 0 } }), /position/);
  assert.throws(edit({ startMm: { x: 0, y: Number.POSITIVE_INFINITY, z: 0 } }), /position/);
  assert.throws(edit({ sectionId: '45x45' }), /section/);
  assert.throws(edit({ axis: 'w' }), /axis/);
  assert.throws(edit({ heightAxis: 'z' }), /height/);
  assert.throws(() => editProfile(history, 'part-9', { lengthMm: 600 }), /part-9/);
});
