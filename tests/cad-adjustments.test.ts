import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  replayDesign,
} from '../src/cad/history.ts';
import { editPlate } from '../src/cad/plates.ts';
import {
  draftPeripheral,
  editPeripheral,
  editPeripheralDraft,
  swapPeripheralType,
} from '../src/cad/peripherals.ts';
import { addAdjustment, editAdjustment, removeAdjustment } from '../src/cad/adjustments.ts';
import { fastenWithBolts, fastenWithBrackets } from '../src/cad/fastening.ts';
import { peripheralType } from '../src/cad/catalog.ts';
import { designData, readDesign } from '../src/cockpit-design.ts';
import { plateHistory, railHistory, withPeripheral } from './support/designs.ts';

/** The rail with a seat on the middle of its top: part-2. */
const seatHistory = () => withPeripheral(railHistory(), 'part-1', 'generic-seat');
const adjustmentOf = (history, partId) =>
  history.find((operation) => operation.partId === partId && 'name' in operation).adjustment;
const designBox = (history, partId) => replayDesign(history).resolved.get(partId).box;
const fittedBox = (history, partId) => replayDesign(history).fitted.resolved.get(partId).box;
const shifted = (box, axis, mm) => {
  const moved = { min: { ...box.min }, max: { ...box.max } };
  moved.min[axis] += mm;
  moved.max[axis] += mm;
  return moved;
};

test('a seat is mounted with the travel of its rails, along the way it faces, at its center', () => {
  const seat = peripheralType('generic-seat');
  assert.equal(seat.railTravelMm > 0, true);
  assert.equal(seat.source.kind, 'estimated');
  const draft = draftPeripheral(railHistory(), 'part-1', 'generic-seat');
  assert.deepEqual(draft.adjustment, { axis: 'z', travelMm: seat.railTravelMm, positionMm: 0 });
  const turned = editPeripheralDraft(railHistory(), draft, { facing: '+x' });
  assert.equal(turned.adjustment.axis, 'x', 'its rails turn with it');
  const pedals = draftPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.equal('adjustment' in pedals, false, 'only a seat comes with one');
});

test('a part gets an adjustment along its parent, centered where it is attached', () => {
  const history = addAdjustment(plateHistory(), 'part-2');
  assert.equal(history.length, plateHistory().length, 'it adds no step');
  assert.deepEqual(adjustmentOf(history, 'part-2'), { axis: 'z', travelMm: 100, positionMm: 0 });
  const pedals = addAdjustment(
    withPeripheral(plateHistory(), 'part-2', 'generic-pedals', { facing: '-x' }),
    'part-3',
  );
  assert.equal(adjustmentOf(pedals, 'part-3').axis, 'x', 'a peripheral slides the way it faces');
  assert.throws(() => addAdjustment(history, 'part-2'), /already/);
  assert.deepEqual(adjustmentOf(removeAdjustment(history, 'part-2'), 'part-2'), undefined);
});

test('moving a part along its travel carries what hangs from it, in the fitted design only', () => {
  const plate = editPlate(plateHistory(), 'part-2', { fromEnd: 'end' });
  const withSeat = withPeripheral(plate, 'part-2', 'generic-pedals');
  const history = editAdjustment(addAdjustment(withSeat, 'part-2'), 'part-2', { positionMm: 30 });
  assert.equal(history.length, withSeat.length);
  for (const partId of ['part-2', 'part-3']) {
    assert.deepEqual(designBox(history, partId), designBox(withSeat, partId));
    assert.deepEqual(fittedBox(history, partId), shifted(designBox(withSeat, partId), 'z', 30));
  }
  assert.deepEqual(fittedBox(history, 'part-1'), designBox(history, 'part-1'));
});

test('a position stays within its travel, and a shorter travel brings it in', () => {
  const history = editAdjustment(addAdjustment(plateHistory(), 'part-2'), 'part-2', {
    positionMm: -50,
  });
  assert.throws(
    () => editAdjustment(history, 'part-2', { positionMm: 60 }),
    /between -50 and 50 mm/,
  );
  const shorter = editAdjustment(history, 'part-2', { travelMm: 40 });
  assert.deepEqual(adjustmentOf(shorter, 'part-2'), { axis: 'z', travelMm: 40, positionMm: -20 });
  assert.throws(() => editAdjustment(history, 'part-2', { travelMm: 0 }), /travel/);
});

test('an adjustment runs along an axis of the face its part hangs from', () => {
  const history = addAdjustment(plateHistory(), 'part-2');
  assert.throws(() => editAdjustment(history, 'part-2', { axis: 'y' }), /along the face/);
  const across = editAdjustment(history, 'part-2', { axis: 'x', travelMm: 20 });
  assert.equal(adjustmentOf(across, 'part-2').axis, 'x');
  // Moved to the side of the rail, the plate cannot slide across it out of that face.
  const onTheSide = editPlate(across, 'part-2', { face: '+x' });
  assert.equal(adjustmentOf(onTheSide, 'part-2').axis, 'z');
});

test('a travel that would take its part off its parent at either end is refused', () => {
  const history = railHistory();
  const post = editDraft(history, draftGrowth(history, 'part-1'), { name: 'Post', lengthMm: 200 });
  const posted = addAdjustment(addOperation(history, post), 'part-2');
  assert.throws(() => editAdjustment(posted, 'part-2', { travelMm: 1001 }), /at most 1000 mm/);
  assert.throws(
    () => editAdjustment(posted, 'part-2', { axis: 'x', travelMm: 60 }),
    /At one end of its 60 mm travel, Post would hang off the side of Rail/,
  );
  // A shorter rail leaves the end of the post's travel off it: its step fails.
  const shorter = editProfile(posted, 'part-1', { lengthMm: 520 });
  assert.match(replayDesign(shorter).failures.get('op-2'), /At one end of its 100 mm travel/);
});

test('a peripheral slides on its mounting, so it only has to stay over its part', () => {
  // The seat's rails take it 100 mm either way, off the 40 mm top of a cross member.
  const history = railHistory();
  const crossMember = editProfile(history, 'part-1', { axis: 'x', lengthMm: 600 });
  const seat = withPeripheral(crossMember, 'part-1', 'generic-seat');
  assert.equal(replayDesign(seat).failures.size, 0);
  const atTheEnd = editPeripheral(seatHistory(), 'part-2', { alongMm: 0 });
  assert.throws(
    () => editAdjustment(atTheEnd, 'part-2', { travelMm: 1000 }),
    /At one end of its 1000 mm travel, Bucket seat would no longer sit over Rail/,
  );
});

test('a span, a foot and a part on the end of a profile have no adjustment', () => {
  let history = railHistory();
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    name: 'Other rail',
    lengthMm: 1000,
    startMm: { x: 500, y: 20, z: 0 },
  });
  const crossing = editDraft(history, draftGrowth(history, 'part-1'), {
    name: 'Crossing',
    face: '+x',
    alongMm: 500,
    lengthMm: 200,
  });
  const spanned = editProfile(addOperation(history, crossing), 'part-3', { reachesId: 'part-2' });
  assert.throws(() => addAdjustment(spanned, 'part-3'), /span/);
  const onTheEnd = editDraft(history, draftGrowth(history, 'part-1'), {
    face: '+z',
    heightAxis: 'y',
    alongMm: 0,
    lengthMm: 200,
  });
  assert.throws(() => addAdjustment(addOperation(history, onTheEnd), 'part-3'), /end of Rail/);
  const footed = addFoot(railHistory(), 'part-1').history;
  assert.throws(() => addAdjustment(footed, 'part-2'), /foot/);
});

test('bolts stay in the slots of the profile while its plate slides, so the parts to buy stay', () => {
  const bolted = fastenWithBolts(plateHistory(), 'part-2@part-1', 2);
  const history = editAdjustment(addAdjustment(bolted, 'part-2'), 'part-2', { positionMm: 40 });
  const design = replayDesign(history);
  assert.deepEqual(design.connectors, replayDesign(bolted).connectors);
  assert.deepEqual(design.fitted.connectors, design.connectors);
});

test('a corner bracket goes with the profile it fastens as that profile slides', () => {
  const history = railHistory();
  const post = editDraft(history, draftGrowth(history, 'part-1'), { lengthMm: 200 });
  const fastened = fastenWithBrackets(addOperation(history, post), 'part-2@part-1');
  const slid = editAdjustment(addAdjustment(fastened, 'part-2'), 'part-2', { positionMm: 20 });
  const design = replayDesign(slid);
  assert.equal(design.fitted.connectors.length, 2);
  design.fitted.connectors.forEach((bracket, index) =>
    assert.deepEqual(bracket.box, shifted(design.connectors[index].box, 'z', 20)),
  );
});

test('a span that depends on a moved part keeps its length and is reported', () => {
  // A post up from the rail's top, and a crossing out of its right side towards a second rail.
  let history = railHistory();
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    name: 'High rail',
    lengthMm: 1000,
    startMm: { x: 500, y: 140, z: 0 },
  });
  const post = editDraft(history, draftGrowth(history, 'part-1'), { name: 'Post', lengthMm: 200 });
  history = addOperation(history, post);
  const crossing = editDraft(history, draftGrowth(history, 'part-3'), {
    name: 'Crossing',
    face: '+x',
    fromEnd: 'start',
    alongMm: 100,
  });
  history = editProfile(addOperation(history, crossing), 'part-4', { reachesId: 'part-2' });
  const slid = editAdjustment(addAdjustment(history, 'part-3'), 'part-3', {
    axis: 'x',
    travelMm: 40,
    positionMm: 10,
  });
  const design = replayDesign(slid);
  assert.deepEqual(design.fitted.changedSpans, [
    { partId: 'part-4', reachesId: 'part-2', changeMm: -10 },
  ]);
  const span = design.fitted.resolved.get('part-4');
  assert.equal(span.lengthMm, 460);
  assert.equal(span.box.max.x, 490);
  assert.deepEqual(replayDesign(history).fitted.changedSpans, []);
});

test('swapping a peripheral keeps its adjustment, taking the travel of a seat’s rails', () => {
  const pedals = editAdjustment(
    addAdjustment(withPeripheral(railHistory(), 'part-1', 'generic-pedals'), 'part-2'),
    'part-2',
    { travelMm: 300, positionMm: 140 },
  );
  const seat = swapPeripheralType(pedals, 'part-2', 'generic-seat');
  const { railTravelMm } = peripheralType('generic-seat');
  assert.deepEqual(adjustmentOf(seat, 'part-2'), {
    axis: 'z',
    travelMm: railTravelMm,
    positionMm: railTravelMm / 2,
  });
  const back = swapPeripheralType(seat, 'part-2', 'generic-wheel-base');
  assert.deepEqual(adjustmentOf(back, 'part-2'), adjustmentOf(seat, 'part-2'));
  const moved = editPeripheral(seat, 'part-2', { alongMm: 400 });
  assert.deepEqual(adjustmentOf(moved, 'part-2'), adjustmentOf(seat, 'part-2'));
});

test('an adjustment is saved with its step and read back; a wrong one is refused', () => {
  const history = editAdjustment(seatHistory(), 'part-2', { positionMm: -30 });
  const data = JSON.parse(JSON.stringify(designData({ history })));
  assert.deepEqual(readDesign(data).history, history);
  const withAdjustment = (adjustment) => ({
    ...data,
    history: [data.history[0], { ...data.history[1], adjustment }],
  });
  assert.throws(
    () => readDesign(withAdjustment({ axis: 'z', travelMm: 200, positionMm: 0, extra: 1 })),
    /extra/,
  );
  assert.throws(() => readDesign(withAdjustment({ axis: 'w', travelMm: 200, positionMm: 0 })), /w/);
  assert.throws(
    () => readDesign(withAdjustment({ axis: 'z', travelMm: 200, positionMm: 150 })),
    /between -100 and 100 mm/,
  );
  assert.throws(
    () => readDesign(withAdjustment({ axis: 'y', travelMm: 200, positionMm: 0 })),
    /along the face/,
  );
});
