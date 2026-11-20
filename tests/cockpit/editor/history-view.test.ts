import test from 'node:test';
import assert from 'node:assert/strict';
import { designPanelHTML, type DesignPanel } from '../../../src/cockpit/editor/history-view.ts';
import { fastenWithBolts, fastenWithBrackets } from '../../../src/cockpit/cad/history/fastening.ts';
import {
  addFoot,
  addOperation,
  draftGrowth,
  editProfile,
  removePart,
  replayDesign,
  type Operation,
} from '../../../src/cockpit/cad/history/history.ts';
import {
  anchoredProfiles,
  growthTowardsRail,
  plateHistory,
  railHistory,
  withGrowth,
  withPeripheral,
} from '../../support/designs.ts';
import { captured } from '../../support/lookups.ts';

const panel = (changes: Partial<DesignPanel> = {}) => {
  const history = changes.history ?? [];
  return designPanelHTML({
    history,
    marker: history.length,
    selectedOperationId: null,
    failures: replayDesign(history).failures,
    canUndo: false,
    canRedo: false,
    ...changes,
  });
};

const stepOf = (html: string, operationId: string) =>
  captured(
    new RegExp(`<li[^>]*><button[^>]*data-operation="${operationId}"[\\s\\S]*?</li>`),
    html,
    0,
  );

test('an empty design explains how it starts and offers the first profile', () => {
  const html = panel();
  assert.match(html, /id="emptyDesign"/);
  assert.match(html, /id="addProfile"/);
  assert.doesNotMatch(html, /data-part="/);
});

test('the history lists its operations in order, with the selected one pressed', () => {
  const history = editProfile(anchoredProfiles(2), 'part-2', { name: 'Rail <left>' });
  const html = panel({ history, selectedOperationId: 'op-2' });
  assert.doesNotMatch(html, /id="emptyDesign"/);
  const steps = [...html.matchAll(/data-part="([^"]+)" aria-pressed="(true|false)"/g)];
  assert.deepEqual(
    steps.map(([, part, pressed]) => [part, pressed]),
    [
      ['part-1', 'false'],
      ['part-2', 'true'],
    ],
  );
  assert.match(html, /Rail left/);
  assert.match(html, /id="addProfile"/);
});

test('undo and redo are offered only when there is something to undo or redo', () => {
  const history = anchoredProfiles(1);
  assert.match(panel({ history }), /id="undoEdit"[^>]*disabled/);
  assert.match(panel({ history }), /id="redoEdit"[^>]*disabled/);
  assert.doesNotMatch(panel({ history, canUndo: true }), /id="undoEdit"[^>]*disabled/);
  assert.doesNotMatch(panel({ history, canRedo: true }), /id="redoEdit"[^>]*disabled/);
});

test('an empty design shows undo and redo only when one of them can be used', () => {
  assert.doesNotMatch(panel(), /id="undoEdit"|id="redoEdit"/);
  const undone = panel({ canRedo: true });
  assert.match(undone, /id="undoEdit"[^>]*disabled/);
  assert.doesNotMatch(undone, /id="redoEdit"[^>]*disabled/);
});

test('the history marker sits after the steps the view shows; later steps wait below it', () => {
  const history = anchoredProfiles(3);
  const html = panel({ history, marker: 1 });
  const marker = html.indexOf('id="historyMarker"');
  assert.ok(html.indexOf('data-operation="op-1"') < marker);
  assert.ok(html.indexOf('data-operation="op-2"') > marker);
  assert.match(stepOf(html, 'op-2'), /disabled/);
  assert.doesNotMatch(stepOf(html, 'op-1'), /disabled/);
  assert.doesNotMatch(html, /id="markerBack"[^>]*disabled/);
  assert.match(panel({ history }), /id="markerForward"[^>]*disabled/);
  assert.match(panel({ history, marker: 0 }), /id="markerBack"[^>]*disabled/);
  assert.match(html, /New steps go in at the marker/);
});

test('a failed step says why, with a symbol as well as its look', () => {
  let history = editProfile(anchoredProfiles(1), 'part-1', { name: 'Rail', lengthMm: 1000 });
  history = addOperation(history, draftGrowth(history, 'part-1'));
  history = editProfile(history, 'part-1', { lengthMm: 100 });
  const step = stepOf(panel({ history }), 'op-2');
  assert.match(step, /class="history-step failed"/);
  assert.match(step, /⚠ Failed: 40 × 40 profile 2 would hang off Rail/);
});

test('a grown profile says what it grows out of or lies on, and what it reaches', () => {
  const grown = withGrowth(railHistory(), 'part-1');
  assert.match(panel({ history: grown }), /Grown out of Rail · 40 × 40 · 500 mm/);
  const lying = editProfile(grown, 'part-2', { way: '+x' });
  assert.match(panel({ history: lying }), /Laid on Rail/);
  const spanned = editProfile(growthTowardsRail(), 'part-3', { reachesId: 'part-2' });
  assert.match(panel({ history: spanned }), /Grown out of A, reaching C/);
  const away = editProfile(spanned, 'part-2', { startMm: { x: 500, y: 20, z: 600 } });
  assert.match(panel({ history: away }), /⚠ not meeting C/);
});

test('a step that adds to a part or removes it names the part', () => {
  const { history: footed } = addFoot(anchoredProfiles(1), 'part-1');
  const foot = panel({ history: footed });
  assert.match(foot, /Leveling foot 2/);
  assert.match(foot, /Under 40 × 40 profile 1 · Leveling foot/);
  assert.match(
    panel({ history: plateHistory() }),
    /Plate 2.*On Rail · 300 × 300 mm · Aluminium sheet, 8 mm/s,
  );
  const pedals = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.match(panel({ history: pedals }), /Pedal set.*Mounted on Rail · Pedals/s);
  const removed = removePart(railHistory(), 'part-1');
  assert.match(stepOf(panel({ history: removed }), 'op-2'), /Removes Rail/);
});

test('the steps of a joint name its two parts, and a fastening its connectors', () => {
  const pair = anchoredProfiles(2);
  const joined: Operation[] = [
    ...pair,
    { kind: 'join-parts', id: 'op-3', partId: 'part-2', toPartId: 'part-1' },
  ];
  assert.match(panel({ history: joined }), /Joins 40 × 40 profile 2 to 40 × 40 profile 1/);
  const upright = withGrowth(editProfile(railHistory(), 'part-1', { name: 'A' }), 'part-1', {
    name: 'B',
  });
  const bracketed = fastenWithBrackets(upright, 'part-2@part-1');
  assert.match(
    panel({ history: bracketed }),
    /Fastens B to A<\/strong><small>2 × 40 corner bracket/,
  );
  const bolted = fastenWithBolts(plateHistory(), 'part-2@part-1', 2);
  assert.match(panel({ history: bolted }), /Fastens Plate 2 to Rail.*2 bolts in each slot/s);
});

test('in Fit, the history adds no profile, as the frame is locked', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.match(panel({ history, fitting: true }), /id="addProfile"[^>]*disabled/);
  assert.doesNotMatch(panel({ history }), /id="addProfile"[^>]*disabled/);
});

test('a step is tagged with the subassembly its part belongs to', () => {
  const history = withGrowth(railHistory(), 'part-1');
  const html = panel({ history, subassemblyTags: new Map([['op-2', 'Wheel <deck>']]) });
  assert.match(
    stepOf(html, 'op-2'),
    /<small class="history-subassembly" data-subassembly-tag>▣ In Wheel &lt;deck&gt;<\/small>/,
  );
  assert.doesNotMatch(stepOf(html, 'op-1'), /history-subassembly/);
});
