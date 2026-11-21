import test from 'node:test';
import assert from 'node:assert/strict';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { addAdjustment, editAdjustment } from '../../../src/cockpit/cad/history/adjustments.ts';
import { removePart, type Operation } from '../../../src/cockpit/cad/history/history.ts';
import {
  anchoredProfiles,
  plateHistory,
  railHistory,
  withPeripheral,
} from '../../support/designs.ts';
import { captured } from '../../support/lookups.ts';

const fitting = { fitting: true };

test('without a selected part the inspector says how to select one', () => {
  assert.match(partInspectorHTML([], undefined), /id="noPartSelected"/);
  assert.doesNotMatch(partInspectorHTML([], undefined), /data-part-field/);
});

test('the inspector of a part deletes its step; the view has its other tools', () => {
  const history = anchoredProfiles(1);
  const html = partInspectorHTML(history, history[0]);
  assert.match(html, /id="deleteStep"/);
  assert.doesNotMatch(html, /id="removePart"|id="growProfile"|id="putPlate"|id="addFoot"/);
});

test('the deletion of a step comes first in its inspector, before any of its values', () => {
  const peripheral = withPeripheral(railHistory(), 'part-1', 'generic-seat');
  const removal = removePart(railHistory(), 'part-1');
  for (const [history, step] of [
    [peripheral, peripheral[1]],
    [peripheral, peripheral[0]],
    [removal, removal[1]],
  ] as const) {
    const html = partInspectorHTML(history, step, 'A reason.', [], [], {
      fitting: step.kind === 'mount-peripheral',
    });
    assert.match(
      html,
      /^<div class="part-inspector" id="partInspectorFields"><div class="step-actions">[^]*?id="deleteStep"[^]*?<\/div><p class="layout-hint part-warning">⚠ Failed/,
    );
  }
});

test('a failed step says why in its inspector, and its values can still be fixed', () => {
  const history = anchoredProfiles(1);
  const failed = partInspectorHTML(history, history[0], 'It grows out of a part that was deleted.');
  assert.match(failed, /⚠ Failed: It grows out of a part that was deleted\./);
  assert.match(failed, /data-part-field="name"/);
});

test('a removal step names the part it removes, and its inspector can only delete it', () => {
  const history = removePart(railHistory(), 'part-1');
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Removes <strong>Rail<\/strong>/);
  assert.match(html, /id="deleteStep"/);
  assert.doesNotMatch(html, /data-part-field/);
});

test('the inspector of a join can only delete it', () => {
  const history: Operation[] = [
    ...anchoredProfiles(2),
    { kind: 'join-parts', id: 'op-3', partId: 'part-2', toPartId: 'part-1' },
  ];
  assert.match(partInspectorHTML(history, history[2]), /id="deleteStep"/);
});

test('in Fit, the frame is locked: its steps can be selected but not changed', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  const locked = partInspectorHTML(history, history[0], undefined, [], [], fitting);
  assert.match(locked, /id="lockedPart"/);
  assert.match(locked, /Rail/);
  assert.doesNotMatch(locked, /data-part-field|id="deleteStep"/);
  assert.match(
    partInspectorHTML(history, history[1], undefined, [], [], fitting),
    /id="part-facing"/,
  );
});

test('in Fit, an attached part of the frame stays locked but gets an adjustment', () => {
  const history = plateHistory();
  const fixed = partInspectorHTML(history, history[1], undefined, [], [], fitting);
  assert.match(fixed, /id="lockedPart"/);
  assert.match(fixed, /id="addAdjustment"/);
  assert.doesNotMatch(fixed, /data-part-field|id="adjustmentTravel"/);
  const adjusted = editAdjustment(addAdjustment(history, 'part-2'), 'part-2', { positionMm: 20 });
  const html = partInspectorHTML(adjusted, adjusted[1], undefined, [], [], fitting);
  const axis = captured(/<select id="adjustmentAxis".*?<\/select>/s, html, 0);
  assert.match(axis, /data-adjustment-field="axis"/);
  assert.deepEqual(
    [...axis.matchAll(/value="(\w)"/g)].map(([, value]) => value),
    ['x', 'z'],
    'the two axes of the face it rests on',
  );
  assert.match(axis, /value="z" selected/);
  assert.match(html, /id="adjustmentTravel"[^>]*min="1" max="1000"[^>]*value="100"/);
  assert.match(html, /id="adjustmentPosition"[^>]*min="-50" max="50"[^>]*value="20"/);
  assert.match(html, /id="removeAdjustment"/);
  assert.doesNotMatch(html, /id="addAdjustment"/);
  const designing = partInspectorHTML(adjusted, adjusted[1]);
  assert.doesNotMatch(designing, /data-adjustment-field|id="addAdjustment"/, 'only in Fit');
  const rail = partInspectorHTML(history, history[0], undefined, [], [], fitting);
  assert.doesNotMatch(rail, /id="addAdjustment"/, 'an anchored part does not slide');
});

test('in Fit, a peripheral sliding on a plate runs on its rails or in slots of the plate', () => {
  const onPlate = withPeripheral(plateHistory(), 'part-2', 'generic-seat');
  const seat = onPlate[2];
  const html = partInspectorHTML(onPlate, seat, undefined, [], [], fitting);
  const runsOn = captured(/<select id="adjustmentRunsOn".*?<\/select>/s, html, 0);
  assert.match(runsOn, /data-adjustment-field="runsOn"/);
  assert.deepEqual(
    [...runsOn.matchAll(/value="(\w+)"/g)].map(([, value]) => value),
    ['rails', 'slots'],
  );
  assert.match(runsOn, /value="rails" selected/);
  const onRail = withPeripheral(railHistory(), 'part-1', 'generic-seat');
  const onAProfile = partInspectorHTML(onRail, onRail[1], undefined, [], [], fitting);
  assert.doesNotMatch(onAProfile, /id="adjustmentRunsOn"/, 'on a profile it slides on T-nuts');
});

test("a plate's inspector exports its DXF and its template, in Fit as well, but not while its step fails", () => {
  const history = plateHistory();
  const plate = history[1];
  for (const html of [
    partInspectorHTML(history, plate),
    partInspectorHTML(history, plate, undefined, [], [], fitting),
  ]) {
    assert.match(html, /id="exportPlateDxf"/);
    assert.match(html, /id="exportPlateSvg"/);
  }
  const failed = partInspectorHTML(history, plate, 'It rests on a part that was deleted.');
  assert.doesNotMatch(failed, /id="exportPlate/);
  assert.doesNotMatch(partInspectorHTML(history, history[0]), /id="exportPlate/);
});
