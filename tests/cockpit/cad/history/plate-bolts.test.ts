import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editProfile,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import {
  draftPlate,
  editPlate,
  editPlateDraft,
} from '../../../../src/cockpit/cad/history/plates.ts';
import {
  fastenWithBolts,
  jointsOfPart,
  joinParts,
  setConnector,
  touchingParts,
} from '../../../../src/cockpit/cad/history/fastening.ts';
import { cockpitInterferences } from '../../../../src/cockpit/cad/analysis/interference.ts';
import { partsToBuy } from '../../../../src/cockpit/cad/output/parts-to-buy.ts';
import type { Axis } from '../../../../src/cockpit/cad/parts/assembly.ts';
import { ofKind, present } from '../../../support/lookups.ts';

/**
 * Two 40 × 40 rails front to back, 1000 mm long and 200 mm apart, and a 300 × 300 × 8 mm plate
 * resting on the left one (part-1), its center between them, so it touches the right one (part-2)
 * too. The plate is part-3.
 */
function railsAndPlate({ leftRail = {}, acrossMm = 100 } = {}) {
  let history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'Left rail',
    lengthMm: 1000,
    startMm: { x: -100, y: 20, z: 0 },
    ...leftRail,
  });
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    name: 'Right rail',
    lengthMm: 1000,
    startMm: { x: 100, y: 20, z: 0 },
  });
  return addOperation(
    history,
    editPlateDraft(history, draftPlate(history, 'part-1'), { name: 'Plate', acrossMm }),
  );
}
const LEFT = 'part-3@part-1';
const AXES: readonly Axis[] = ['x', 'y', 'z'];
const centersOf = (history: readonly Operation[]) =>
  replayDesign(history).connectors.map(({ box }) =>
    AXES.map((axis) => (box.min[axis] + box.max[axis]) / 2),
  );

test('a plate is joined to the other profiles it touches, the plate first', () => {
  const history = railsAndPlate();
  assert.deepEqual(touchingParts(history, 'part-3'), ['part-2']);
  assert.deepEqual(touchingParts(history, 'part-2'), ['part-3']);
  const joined = joinParts(history, 'part-2', 'part-3');
  assert.deepEqual(joined.at(-1), {
    kind: 'join-parts',
    id: 'op-4',
    partId: 'part-3',
    toPartId: 'part-2',
  });
  assert.deepEqual(
    replayDesign(joined).joints.map((joint) => [joint.id, joint.toFace]),
    [
      [LEFT, '+y'],
      ['part-3@part-2', '+y'],
    ],
  );
});

test('bolts go evenly along the contact, on the center line of the slot the plate covers', () => {
  const history = fastenWithBolts(railsAndPlate(), LEFT, 2);
  assert.deepEqual(history.at(-1), {
    kind: 'fasten-joint',
    id: 'op-4',
    partId: 'part-3',
    toPartId: 'part-1',
    connectors: [{ typeId: 'plate-bolt-m8', perSlot: 2 }],
  });
  assert.deepEqual(centersOf(history), [
    [-100, 52, 425],
    [-100, 52, 575],
  ]);
  const [head] = replayDesign(history).connectors;
  assert.equal(head.side, '+y', 'the head stands on the plate');
  assert.equal(head.box.max.x - head.box.min.x, 13);
});

test('a wide face has a slot per module, and every slot under the plate takes its bolts', () => {
  const wide = railsAndPlate({
    leftRail: { sectionId: '40x80', heightAxis: 'x', startMm: { x: -100, y: 20, z: 0 } },
  });
  assert.deepEqual(centersOf(fastenWithBolts(wide, LEFT, 1)), [
    [-120, 52, 500],
    [-80, 52, 500],
  ]);
});

test('a plate that covers no slot takes no bolts, and moving it off its slots fails them', () => {
  assert.throws(
    () => fastenWithBolts(railsAndPlate({ acrossMm: 150 }), LEFT, 2),
    /Plate covers no slot of Left rail/,
  );
  const bolted = fastenWithBolts(railsAndPlate(), LEFT, 2);
  const moved = editPlate(bolted, 'part-3', { acrossMm: 150 });
  assert.match(
    present(replayDesign(moved).failures.get('op-4'), 'failure of op-4'),
    /covers no slot of Left rail/,
  );
});

test('the bolts in each slot are set on the joint, in its one step, and none takes it away', () => {
  const three = fastenWithBolts(railsAndPlate(), LEFT, 3);
  const one = fastenWithBolts(three, LEFT, 1);
  assert.equal(one.length, 4);
  assert.deepEqual(ofKind(one.at(-1), 'fasten-joint').connectors, [
    { typeId: 'plate-bolt-m8', perSlot: 1 },
  ]);
  assert.equal(fastenWithBolts(one, LEFT, 0).length, 3);
  assert.throws(() => fastenWithBolts(one, LEFT, 11), /between 1 and 10/);
  assert.throws(() => fastenWithBolts(one, LEFT, 1.5), /whole number/);
});

test('bolts fasten only a plate to a profile, and no corner bracket fastens a plate', () => {
  const history = railsAndPlate();
  const grown = addOperation(history, draftGrowth(history, 'part-1'));
  assert.throws(() => fastenWithBolts(grown, 'part-4@part-1', 2), /fasten a plate to a profile/);
  assert.throws(() => setConnector(history, LEFT, '+x', true), /fastens a profile/);
});

test('the joints of a plate say how many bolts each slot has, and how many slots it covers', () => {
  const history = fastenWithBolts(railsAndPlate(), LEFT, 2);
  const [joint] = jointsOfPart(history, 'part-3');
  assert.deepEqual(joint.bolts, { perSlot: 2, slots: 1 });
  assert.deepEqual(joint.fittingSides, []);
  const grown = addOperation(history, draftGrowth(history, 'part-1'));
  const profileJoint = jointsOfPart(grown, 'part-1').find(
    (found) => found.jointId === 'part-4@part-1',
  );
  assert.equal(present(profileJoint, 'joint part-4@part-1').bolts, null);
});

test('bolt heads stand on the plate without reaching into it', () => {
  const design = replayDesign(fastenWithBolts(railsAndPlate(), LEFT, 2));
  assert.deepEqual(cockpitInterferences(design.resolved, design.connectors), []);
});

test('bolts and T-nuts are bought, the bolts long enough for the plate', () => {
  const joined = joinParts(railsAndPlate(), 'part-3', 'part-2');
  const history = fastenWithBolts(fastenWithBolts(joined, LEFT, 2), 'part-3@part-2', 2);
  const design = replayDesign(history);
  const list = partsToBuy(design.resolved, design.connectors, design.joints);
  assert.deepEqual(list.connectors, []);
  assert.deepEqual(list.fasteners, [
    { id: 'bolt-m8x16', quantity: 4 },
    { id: 't-nut-slot-8-m8', quantity: 4 },
  ]);
  assert.deepEqual(list.pendingJoints, []);
});
