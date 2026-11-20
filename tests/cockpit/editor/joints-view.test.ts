import test from 'node:test';
import assert from 'node:assert/strict';
import { jointCardHTML } from '../../../src/cockpit/editor/joints-view.ts';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import {
  fastenWithBrackets,
  jointsOfPart,
  type JointOfPart,
} from '../../../src/cockpit/cad/history/fastening.ts';
import { editProfile, type Operation } from '../../../src/cockpit/cad/history/history.ts';
import { anchoredProfiles, plateHistory, railHistory, withGrowth } from '../../support/designs.ts';

/** Rail A and upright B grown out of its top, with the joint between them. */
const railAndUpright = () =>
  withGrowth(editProfile(railHistory(), 'part-1', { name: 'A' }), 'part-1', { name: 'B' });
const jointsOfB = (history: readonly Operation[]) => jointsOfPart(history, 'part-2');

const plateJoint = (bolts: JointOfPart['bolts']): JointOfPart => ({
  jointId: 'part-2@part-1',
  partName: 'Plate 2',
  toPartName: 'Rail',
  sides: [],
  fittingSides: [],
  alongSides: [],
  besideMetSides: [],
  bolts,
});

test('the inspector lists the joints of a part, pending until they have connectors', () => {
  const history = railAndUpright();
  const html = partInspectorHTML(history, history[1], undefined, jointsOfB(history));
  assert.match(html, /id="partJoints"/);
  assert.match(html, /B to A<\/strong><small>⚠ No connectors yet/);
  assert.match(
    html,
    /data-joint="part-2@part-1" data-side="\+z" aria-pressed="false"[^>]*>\+ Front/,
  );
  assert.match(html, /data-joint-brackets="part-2@part-1"/);
});

test('a fastened joint says how many brackets it has, and its fastening is a step', () => {
  const history = fastenWithBrackets(railAndUpright(), 'part-2@part-1');
  const html = partInspectorHTML(history, history[1], undefined, jointsOfB(history));
  assert.match(html, /✓ 2 corner brackets/);
  assert.match(html, /data-side="-z" aria-pressed="true"[^>]*>✓ Back/);
  assert.doesNotMatch(html, /data-joint-brackets/);
  const fastening = partInspectorHTML(history, history[2]);
  assert.match(fastening, /Puts 2 × 40 corner bracket on the joint of <strong>B<\/strong>/);
  assert.match(fastening, /id="deleteStep"/);
});

test('parts that touch without a joint can be joined from the inspector', () => {
  const history = anchoredProfiles(2);
  const html = partInspectorHTML(
    history,
    history[0],
    undefined,
    [],
    [{ partId: 'part-2', name: '<D>' }],
  );
  assert.match(html, /id="touchingParts"/);
  assert.match(html, /data-join="part-2"[^>]*>.*Join to &lt;D&gt;/);
});

test('the joint of a plate takes bolts in each slot it covers, two at once with the quick action', () => {
  const history = plateHistory();
  const inspect = (bolts: JointOfPart['bolts']) =>
    partInspectorHTML(history, history[1], undefined, [plateJoint(bolts)]);
  const none = inspect({ perSlot: 0, slots: 1 });
  assert.match(none, /⚠ No bolts yet/);
  assert.match(none, /data-joint-bolts="part-2@part-1"[^>]*value="0"/);
  assert.match(none, /data-joint-two-bolts="part-2@part-1"/);
  assert.doesNotMatch(none, /No connector in the catalog fits/);
  const four = inspect({ perSlot: 2, slots: 2 });
  assert.match(four, /✓ 4 bolts, 2 in each of 2 slots/);
  assert.doesNotMatch(four, /data-joint-two-bolts/, 'it has two in each slot already');
  const uncovered = inspect({ perSlot: 0, slots: 0 });
  assert.match(uncovered, /covers no slot of Rail/);
  assert.doesNotMatch(uncovered, /data-joint-bolts/);
});

test('the card of a joint names its parts and state, with its quick action and the inspector', () => {
  const [joint] = jointsOfB(railAndUpright());
  const html = jointCardHTML({ kind: 'joint', partId: 'part-2', joint });
  assert.match(html, /B to A<\/strong><small>⚠ No connectors yet/);
  assert.match(html, /data-joint-brackets="part-2@part-1"/);
  assert.match(html, /data-joint-more="part-2"/);
});

test('the card of two parts that only touch joins them', () => {
  const html = jointCardHTML({
    kind: 'touching',
    partId: 'part-1',
    partName: 'A',
    toPartId: 'part-2',
    toPartName: 'C',
  });
  assert.match(html, /<strong>A and C<\/strong><small>\+ Touching, without a joint/);
  assert.match(html, /data-join="part-2" data-join-from="part-1"[^>]*>.*Join to C/);
  assert.match(html, /data-joint-more="part-1"/);
});

test('the corners of a crossing say which profile each bracket stands beside', () => {
  const crossing: JointOfPart = {
    jointId: 'part-3@part-1',
    partName: 'C',
    toPartName: 'A',
    sides: ['+z'],
    fittingSides: ['+x', '+z', '-z'],
    alongSides: ['+z', '-z'],
    besideMetSides: ['+x'],
    bolts: null,
  };
  const html = jointCardHTML({ kind: 'joint', partId: 'part-3', joint: crossing });
  assert.match(html, /data-side="\+x" aria-pressed="false"[^>]*>\+ [^<]*, beside A</);
  assert.match(html, /data-side="\+z" aria-pressed="true"[^>]*>✓ [^<]*, beside C</);
});

test('a joint no bracket fits says what a bracket needs', () => {
  const history = railAndUpright();
  const [joint] = jointsOfB(history);
  const html = jointCardHTML({
    kind: 'joint',
    partId: 'part-2',
    joint: { ...joint, fittingSides: [], alongSides: [] },
  });
  assert.match(html, /No connector in the catalog fits this joint yet/);
  assert.match(html, /or lies across it/);
});
