import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteKeyAction,
  designPanelHTML,
  footChange,
  growPanelHTML,
  jointCardHTML,
  partChange,
  partField,
  partInspectorHTML,
  partToolsOf,
  plateChange,
  platePanelHTML,
  peripheralChange,
  peripheralPanelHTML,
} from '../src/cockpit-editor-view.ts';
import { draftPlate } from '../src/cad/plates.ts';
import { draftPeripheral } from '../src/cad/peripherals.ts';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  removePart,
  replayDesign,
} from '../src/cad/history.ts';

const historyWith = (count) => {
  let history = [];
  for (let i = 0; i < count; i++) history = addAnchoredProfile(history).history;
  return history;
};
const panel = (changes) => {
  const history = changes?.history ?? [];
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

test('an empty design explains how it starts and offers the first profile', () => {
  const html = panel();
  assert.match(html, /id="emptyDesign"/);
  assert.match(html, /id="addProfile"/);
  assert.doesNotMatch(html, /data-part="/);
});

test('the history lists its operations in order, with the selected one pressed', () => {
  const history = editProfile(historyWith(2), 'part-2', { name: 'Rail <left>' });
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
  const history = historyWith(1);
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

test('the Delete key removes the selected part, or deletes a step that makes none', () => {
  const history = railAndGrowth();
  assert.equal(deleteKeyAction(history[1]), 'remove-part');
  assert.equal(
    deleteKeyAction(history[1], 'It grows out of a part that was deleted.'),
    'delete-step',
  );
  const removal = { kind: 'remove-part', id: 'op-3', removedId: 'part-2' };
  assert.equal(deleteKeyAction(removal), 'delete-step');
  assert.equal(deleteKeyAction(undefined), null);
});

test('without a selected part the inspector says how to select one', () => {
  assert.match(partInspectorHTML([], undefined), /id="noPartSelected"/);
  assert.doesNotMatch(partInspectorHTML([], undefined), /data-part-field/);
});

test('the inspector edits the values of the operation that made the part', () => {
  const [operation] = editProfile(historyWith(1), 'part-1', {
    name: 'Seat "rail"',
    sectionId: '40x80',
    lengthMm: 1200,
    startMm: { x: -280, y: 40, z: 12.5 },
  });
  const html = partInspectorHTML([operation], operation);
  const value = (field) =>
    new RegExp(`data-part-field="${field}"[^>]*value="([^"]*)"`).exec(html)?.[1];
  assert.equal(value('name'), 'Seat &quot;rail&quot;');
  assert.equal(value('lengthMm'), '1200');
  assert.equal(value('startX'), '-280');
  assert.equal(value('startY'), '40');
  assert.equal(value('startZ'), '12.5');
  assert.match(html, /<option value="40x80" selected>40 × 80<\/option>/);
  assert.match(html, /data-part-field="axis"[\s\S]*<option value="z" selected>/);
});

test('the long side of the section can be turned only on a section that has one', () => {
  const [square] = historyWith(1);
  assert.doesNotMatch(partInspectorHTML([square], square), /data-part-field="heightAxis"/);
  const [wide] = editProfile([square], 'part-1', { sectionId: '40x80' });
  const html = partInspectorHTML([wide], wide);
  const choices = /data-part-field="heightAxis"[^>]*>([\s\S]*?)<\/select>/.exec(html)[1];
  assert.deepEqual(
    [...choices.matchAll(/value="(\w)"/g)].map(([, axis]) => axis),
    ['x', 'y'],
  );
  assert.match(choices, /value="y" selected/);
});

test('a field of the inspector changes one value of the operation', () => {
  const [operation] = historyWith(1);
  assert.deepEqual(partChange(operation, 'name', 'Rail'), { name: 'Rail' });
  assert.deepEqual(partChange(operation, 'sectionId', '40x80'), { sectionId: '40x80' });
  assert.deepEqual(partChange(operation, 'axis', 'y'), { axis: 'y' });
  assert.deepEqual(partChange(operation, 'heightAxis', 'x'), { heightAxis: 'x' });
  assert.deepEqual(partChange(operation, 'lengthMm', '650'), { lengthMm: 650 });
  assert.deepEqual(partChange(operation, 'startZ', '-120.5'), {
    startMm: { x: 0, y: 20, z: -120.5 },
  });
});

test('a number field left empty or not a number gives no number to apply', () => {
  const [operation] = historyWith(1);
  assert.ok(Number.isNaN(partChange(operation, 'lengthMm', '').lengthMm));
  assert.ok(Number.isNaN(partChange(operation, 'startX', 'abc').startMm.x));
});

test('the markup names only fields the inspector has', () => {
  assert.equal(partField('lengthMm'), 'lengthMm');
  assert.throws(() => partField('tiltDeg'), /tiltDeg/);
  assert.throws(() => partField(undefined), /undefined/);
});

const railAndGrowth = () => {
  const history = editProfile(historyWith(1), 'part-1', { name: 'Rail', lengthMm: 1000 });
  return addOperation(history, draftGrowth(history, 'part-1'));
};

test('a grown profile says what it grows out of, in the history and in the inspector', () => {
  const history = railAndGrowth();
  assert.match(panel({ history }), /Grown out of Rail · 40 × 40 · 500 mm/);
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Grows out of <strong>Rail<\/strong>/);
  assert.match(html, /<option value="\+y" selected>Top \(\+Y\)<\/option>/);
  assert.match(html, /<option value="-z">Back end \(−Z\)<\/option>/);
  assert.match(html, /<option value="start" selected>Back end<\/option>/);
  assert.match(html, /data-part-field="alongMm"[^>]*value="500"/);
  assert.doesNotMatch(html, /data-part-field="startX"|data-part-field="axis"/);
});

test('out of an end face there is no distance or offset to give', () => {
  const history = railAndGrowth();
  const onEnd = editProfile(history, 'part-2', { face: '+z' });
  const html = partInspectorHTML(onEnd, onEnd[1]);
  assert.doesNotMatch(html, /data-part-field="alongMm"|data-part-field="acrossMm"/);
});

test('the grow panel edits the new profile before it is added', () => {
  const history = editProfile(historyWith(1), 'part-1', { name: 'Rail' });
  const draft = editDraft(history, draftGrowth(history, 'part-1'), { lengthMm: 320 });
  const html = growPanelHTML(history, draft);
  assert.match(html, /out of <strong>Rail<\/strong>/);
  assert.match(html, /id="grow-lengthMm"[^>]*value="320"/);
  assert.match(html, /id="confirmGrowth"/);
  assert.match(html, /id="cancelGrowth"/);
});

test('the place on the face comes from its own fields', () => {
  const [, growth] = railAndGrowth();
  assert.deepEqual(partChange(growth, 'face', '-x'), { face: '-x' });
  assert.deepEqual(partChange(growth, 'fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(partChange(growth, 'alongMm', '120'), { alongMm: 120 });
  assert.deepEqual(partChange(growth, 'acrossMm', '-4'), { acrossMm: -4 });
  assert.throws(() => partChange(growth, 'startX', '0'), /no start/);
  assert.throws(() => partChange(growth, 'face', 'up'), /face/);
});

test('a growth grows out of its face or lies along it, the ways the face allows', () => {
  const history = railAndGrowth();
  const html = partInspectorHTML(history, history[1]);
  const choices = /data-part-field="way"[^>]*>([\s\S]*?)<\/select>/.exec(html)[1];
  assert.deepEqual(
    [...choices.matchAll(/value="([^"]+)"/g)].map(([, way]) => way),
    ['out', '+x', '-x', '+z', '-z'],
  );
  assert.match(choices, /value="out" selected>Out of the face</);
  assert.match(choices, /value="\+z">Along the face, towards the front \(\+Z\)</);
  assert.deepEqual(partChange(history[1], 'way', '-x'), { way: '-x' });
  assert.deepEqual(partChange(history[1], 'way', 'out'), { way: 'out' });
  const lying = editProfile(history, 'part-2', { way: '+x' });
  assert.match(panel({ history: lying }), /Laid on Rail/);
});

/** Rail A, rail C 500 mm to its left, and B grown out of A towards C. */
const towardsC = () => {
  let history = historyWith(2);
  history = editProfile(history, 'part-1', { name: 'A', lengthMm: 1000 });
  history = editProfile(history, 'part-2', { name: 'C', startMm: { x: 500, y: 20, z: 0 } });
  const draft = editDraft(history, draftGrowth(history, 'part-1'), {
    name: 'B',
    face: '+x',
    alongMm: 250,
  });
  return addOperation(history, draft);
};
const reachChoices = (html) =>
  [
    .../data-part-field="reachesId"[^>]*>([\s\S]*?)<\/select>/
      .exec(html)[1]
      .matchAll(/value="([^"]*)"( selected)?>([^<]*)</g),
  ].map(([, value, selected, text]) => [value, Boolean(selected), text]);

test('the end of a grown profile can reach the parts in front of it', () => {
  const history = towardsC();
  const html = partInspectorHTML(history, history[2]);
  assert.deepEqual(reachChoices(html), [
    ['', true, 'Free, at its own length'],
    ['part-2', false, 'Reaches C'],
  ]);
  assert.deepEqual(partChange(history[2], 'reachesId', 'part-2'), { reachesId: 'part-2' });
  assert.deepEqual(partChange(history[2], 'reachesId', ''), { reachesId: null });
  // A profile about to grow can reach a part too, from the design as the view shows it.
  const draft = draftGrowth(history, 'part-1');
  const growing = growPanelHTML([...history, draft], draft);
  assert.deepEqual(reachChoices(growing)[0], ['', true, 'Free, at its own length']);
});

test('a span shows its length as the gap, and says when its end no longer meets its part', () => {
  const spanned = editProfile(towardsC(), 'part-3', { reachesId: 'part-2' });
  const html = partInspectorHTML(spanned, spanned[2]);
  assert.match(html, /id="part-lengthMm"[^>]*value="460"[^>]*disabled/);
  assert.match(html, /length is the gap to C/);
  assert.match(panel({ history: spanned }), /Grown out of A, reaching C/);
  const away = editProfile(spanned, 'part-2', { startMm: { x: 500, y: 20, z: 600 } });
  const open = partInspectorHTML(away, away[2]);
  assert.match(open, /⚠ Its end no longer meets C/);
  assert.deepEqual(reachChoices(open)[1], ['part-2', true, 'Reaches C (not meeting it)']);
  assert.match(panel({ history: away }), /⚠ not meeting C/);
});

const stepOf = (html, operationId) =>
  new RegExp(`<li[^>]*><button[^>]*data-operation="${operationId}"[\\s\\S]*?</li>`).exec(html)[0];

test('the history marker sits after the steps the view shows; later steps wait below it', () => {
  const history = historyWith(3);
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
  let history = editProfile(historyWith(1), 'part-1', { name: 'Rail', lengthMm: 1000 });
  history = addOperation(history, draftGrowth(history, 'part-1'));
  history = editProfile(history, 'part-1', { lengthMm: 100 });
  const step = stepOf(panel({ history }), 'op-2');
  assert.match(step, /class="history-step failed"/);
  assert.match(step, /⚠ Failed: 40 × 40 profile 2 would hang off Rail/);
});

test('a removal step names the part it removes, and its inspector can only delete it', () => {
  const history = removePart(editProfile(historyWith(1), 'part-1', { name: 'Rail' }), 'part-1');
  assert.match(stepOf(panel({ history }), 'op-2'), /Removes Rail/);
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Removes <strong>Rail<\/strong>/);
  assert.match(html, /id="deleteStep"/);
  assert.doesNotMatch(html, /data-part-field/);
  assert.deepEqual(partToolsOf(history[1]), []);
});

test('a profile has the tools of the view, and its inspector deletes its step', () => {
  const history = historyWith(1);
  const html = partInspectorHTML(history, history[0]);
  assert.match(html, /id="deleteStep"/);
  assert.doesNotMatch(html, /id="removePart"|id="growProfile"|id="putPlate"|id="addFoot"/);
  assert.deepEqual(partToolsOf(history[0]), ['grow', 'plate', 'foot', 'remove']);
});

test('a failed step says why in its inspector, and has no tools in the view', () => {
  const history = historyWith(1);
  const reason = 'It grows out of a part that was deleted.';
  const failed = partInspectorHTML(history, history[0], reason);
  assert.match(failed, /⚠ Failed: It grows out of a part that was deleted\./);
  assert.match(failed, /data-part-field="name"/, 'its values can still be fixed');
  assert.deepEqual(partToolsOf(history[0], reason), []);
  assert.deepEqual(partToolsOf(undefined), []);
});

test('a foot is a step under its profile, and its inspector sets its type and place', () => {
  const { history } = addFoot(historyWith(1), 'part-1');
  const step = panel({ history });
  assert.match(step, /Leveling foot 2/);
  assert.match(step, /Under 40 × 40 profile 1 · Leveling foot/);
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Stands under <strong>40 × 40 profile 1<\/strong>/);
  assert.match(html, /id="part-footTypeId"[^>]*><option value="leveling-foot" selected>/);
  assert.match(html, /<option value="locking-caster">Locking caster/);
  assert.match(html, /id="part-fromEnd"/);
  assert.match(html, /id="part-alongMm"[^>]*value="36"/);
  assert.match(html, /estimated/);
  assert.doesNotMatch(html, /id="part-lengthMm"/);
  assert.deepEqual(partToolsOf(history[1]), ['remove']);
});

test('the fields of a foot change the values of its operation', () => {
  assert.deepEqual(footChange('footTypeId', 'locking-caster'), { footTypeId: 'locking-caster' });
  assert.deepEqual(footChange('fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(footChange('alongMm', ''), { alongMm: Number.NaN });
  assert.throws(() => footChange('lengthMm', '300'), /lengthMm/);
});

/** A rail and an upright growing out of its top, with the joint between them. */
async function railAndUpright() {
  const { jointsOfPart } = await import('../src/cad/fastening.ts');
  const base = editProfile(historyWith(1), 'part-1', { name: 'A', lengthMm: 1000 });
  const history = addOperation(base, editDraft(base, draftGrowth(base, 'part-1'), { name: 'B' }));
  return { history, joints: (h) => jointsOfPart(h, 'part-2') };
}

test('the inspector lists the joints of a part, pending until they have connectors', async () => {
  const { history, joints } = await railAndUpright();
  const html = partInspectorHTML(history, history[1], undefined, joints(history));
  assert.match(html, /id="partJoints"/);
  assert.match(html, /B to A<\/strong><small>⚠ No connectors yet/);
  assert.match(
    html,
    /data-joint="part-2@part-1" data-side="\+z" aria-pressed="false"[^>]*>\+ Front/,
  );
  assert.match(html, /data-joint-brackets="part-2@part-1"/);
});

test('a fastened joint says how many brackets it has, and a fastening is a step', async () => {
  const { fastenWithBrackets } = await import('../src/cad/fastening.ts');
  const { history: before, joints } = await railAndUpright();
  const history = fastenWithBrackets(before, 'part-2@part-1');
  const html = partInspectorHTML(history, history[1], undefined, joints(history));
  assert.match(html, /✓ 2 corner brackets/);
  assert.match(html, /data-side="-z" aria-pressed="true"[^>]*>✓ Back/);
  assert.doesNotMatch(html, /data-joint-brackets/);
  const step = panel({ history });
  assert.match(step, /Fastens B to A<\/strong><small>2 × 40 corner bracket/);
  const inspector = partInspectorHTML(history, history[2]);
  assert.match(inspector, /Puts 2 × 40 corner bracket on the joint of <strong>B<\/strong>/);
  assert.match(inspector, /id="deleteStep"/);
});

test('parts that touch without a joint can be joined from the inspector', () => {
  const history = historyWith(2);
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

test('a join is a step that names its two parts', () => {
  const base = historyWith(2);
  const history = [
    ...base,
    { kind: 'join-parts', id: 'op-3', partId: 'part-2', toPartId: 'part-1' },
  ];
  assert.match(panel({ history }), /Joins 40 × 40 profile 2 to 40 × 40 profile 1/);
  assert.match(partInspectorHTML(history, history[2]), /id="deleteStep"/);
});

const railAndPlate = () => {
  const history = editProfile(historyWith(1), 'part-1', { name: 'Rail', lengthMm: 1000 });
  return addOperation(history, draftPlate(history, 'part-1'));
};

test('a plate is a step on its profile, and its inspector sets its sheet, size and place', () => {
  const history = railAndPlate();
  assert.match(panel({ history }), /Plate 2.*On Rail · 300 × 300 mm · Aluminium sheet, 8 mm/s);
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Rests on <strong>Rail<\/strong>/);
  assert.match(html, /id="part-sheetId"[^>]*><option value="aluminium-3">/);
  assert.match(html, /<option value="aluminium-8" selected>Aluminium sheet, 8 mm/);
  assert.match(html, /estimated/);
  assert.match(html, /id="part-widthMm"[^>]*value="300"/);
  assert.match(html, /id="part-depthMm"[^>]*value="300"/);
  assert.match(html, /<option value="z" selected>Front to back \(Z\)<\/option>/);
  assert.doesNotMatch(html, /id="part-depthAxis"[^]*<option value="y"/);
  assert.match(html, /<option value="\+y" selected>Top \(\+Y\)<\/option>/);
  assert.doesNotMatch(html, /Front end \(\+Z\)/, 'a plate rests on a side, never on an end');
  assert.match(html, /id="part-alongMm"[^>]*value="500"/);
  assert.match(html, /id="part-acrossMm"[^>]*value="0"/);
  assert.doesNotMatch(html, /id="part-lengthMm"/);
  assert.deepEqual(partToolsOf(history[1]), ['remove']);
});

test('the plate panel edits the new plate before it is added', () => {
  const history = editProfile(historyWith(1), 'part-1', { name: 'Rail' });
  const html = platePanelHTML(history, draftPlate(history, 'part-1'));
  assert.match(html, /on <strong>Rail<\/strong>/);
  assert.match(html, /id="plate-widthMm"[^>]*value="300"/);
  assert.match(html, /id="confirmPlate"/);
  assert.match(html, /id="cancelPlate"/);
});

test('the fields of a plate change the values of its operation', () => {
  assert.deepEqual(plateChange('name', 'Wheel plate'), { name: 'Wheel plate' });
  assert.deepEqual(plateChange('sheetId', 'aluminium-4'), { sheetId: 'aluminium-4' });
  assert.deepEqual(plateChange('widthMm', '250'), { widthMm: 250 });
  assert.deepEqual(plateChange('depthMm', ''), { depthMm: Number.NaN });
  assert.deepEqual(plateChange('depthAxis', 'x'), { depthAxis: 'x' });
  assert.deepEqual(plateChange('face', '-y'), { face: '-y' });
  assert.deepEqual(plateChange('fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(plateChange('alongMm', '120'), { alongMm: 120 });
  assert.deepEqual(plateChange('acrossMm', '-40'), { acrossMm: -40 });
  assert.throws(() => plateChange('lengthMm', '300'), /lengthMm/);
  assert.equal(partField('depthAxis'), 'depthAxis');
});

const plateJoint = (bolts) => ({
  jointId: 'part-2@part-1',
  partName: 'Plate 2',
  toPartName: 'Rail',
  sides: [],
  fittingSides: [],
  alongSides: [],
  bolts,
});

test('the joint of a plate takes bolts in each slot it covers, two at once with the quick action', () => {
  const history = railAndPlate();
  const inspect = (bolts) => partInspectorHTML(history, history[1], undefined, [plateJoint(bolts)]);
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

test('a fastening with bolts says how many go in each slot', async () => {
  const { fastenWithBolts } = await import('../src/cad/fastening.ts');
  const history = fastenWithBolts(railAndPlate(), 'part-2@part-1', 2);
  assert.match(panel({ history }), /Fastens Plate 2 to Rail.*2 bolts in each slot/s);
});

test('the card of a joint names its parts and state, with its quick action and the inspector', async () => {
  const { history, joints } = await railAndUpright();
  const [joint] = joints(history);
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

const railWithPedals = () => {
  const history = editProfile(historyWith(1), 'part-1', { name: 'Rail', lengthMm: 1000 });
  return addOperation(history, draftPeripheral(history, 'part-1', 'generic-pedals'));
};

test('a peripheral is a step on its part, and its inspector sets its place and the way it faces', () => {
  const history = railWithPedals();
  assert.match(panel({ history }), /Pedal set.*Mounted on Rail · Pedals/s);
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Mounted on <strong>Rail<\/strong>/);
  assert.match(html, /id="part-name"[^>]*value="Pedal set"/);
  assert.match(html, /<option value="\+y" selected>Top \(\+Y\)<\/option>/);
  assert.match(html, /id="part-facing"/);
  assert.match(html, /<option value="\+z" selected>Towards the front \(\+Z\)<\/option>/);
  assert.doesNotMatch(html, /id="part-facing"[^]*<option value="-y"/, 'it faces along its face');
  assert.match(html, /id="part-alongMm"[^>]*value="500"/);
  assert.match(html, /id="part-acrossMm"[^>]*value="0"/);
  assert.match(html, /400 × 200 × 320 mm/);
  assert.match(html, /estimated/);
  assert.deepEqual(partToolsOf(history[1]), ['remove']);
});

test('a peripheral on a plate is mounted on one of its two faces', () => {
  const plated = railAndPlate();
  const history = addOperation(plated, draftPeripheral(plated, 'part-2', 'generic-seat'));
  const html = partInspectorHTML(history, history[2]);
  assert.match(html, /Mounted on <strong>Plate 2<\/strong>/);
  const faces = [...html.matchAll(/id="part-face"[^]*?<\/select>/g)][0][0];
  assert.deepEqual(
    [...faces.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    ['+y', '-y'],
  );
});

test('the peripheral panel edits the new peripheral before it is mounted', () => {
  const history = editProfile(historyWith(1), 'part-1', { name: 'Rail' });
  const html = peripheralPanelHTML(history, draftPeripheral(history, 'part-1', 'generic-seat'));
  assert.match(html, /A new seat on <strong>Rail<\/strong>/);
  assert.match(html, /id="peripheral-alongMm"/);
  assert.match(html, /id="confirmPeripheral"/);
  assert.match(html, /id="cancelPeripheral"/);
});

test('the fields of a peripheral change the values of its operation', () => {
  assert.deepEqual(peripheralChange('name', 'Seat'), { name: 'Seat' });
  assert.deepEqual(peripheralChange('face', '+x'), { face: '+x' });
  assert.deepEqual(peripheralChange('facing', '-x'), { facing: '-x' });
  assert.deepEqual(peripheralChange('fromEnd', 'end'), { fromEnd: 'end' });
  assert.deepEqual(peripheralChange('alongMm', '120'), { alongMm: 120 });
  assert.deepEqual(peripheralChange('acrossMm', ''), { acrossMm: Number.NaN });
  assert.throws(() => peripheralChange('sheetId', 'aluminium-4'), /sheetId/);
  assert.equal(partField('facing'), 'facing');
});
