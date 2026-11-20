import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addOperation,
  deleteOperation,
  draftGrowth,
  editDraft,
  editProfile,
  removePart,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import {
  fastenWithBrackets,
  fittingSides,
  jointsOfPart,
  setConnector,
} from '../../../../src/cockpit/cad/history/fastening.ts';
import { partsToBuy } from '../../../../src/cockpit/cad/output/parts-to-buy.ts';
import { cadChecks } from '../../../../src/cockpit/checks.ts';
import { ofKind, present } from '../../../support/lookups.ts';

const JOINT = 'part-2@part-1';
const BRACKET = 'corner-bracket-40';

/**
 * A: a 40 × 40 rail front to back, 1000 mm long, on the floor. B: an upright growing out of its
 * top, 500 mm from its back end.
 */
function ab(alongMm = 500) {
  const history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'A',
    lengthMm: 1000,
  });
  return addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { name: 'B', alongMm, lengthMm: 300 }),
  );
}
const connectorsOf = (history: readonly Operation[]) => replayDesign(history).connectors;

test('a corner bracket fits the sides of B along A, where its legs rest on both parts', () => {
  assert.deepEqual(fittingSides(ab(), JOINT), ['+z', '-z']);
});

test('two corner brackets along the part it meets are one step that fastens the joint', () => {
  const history = fastenWithBrackets(ab(), JOINT);
  assert.deepEqual(history[2], {
    kind: 'fasten-joint',
    id: 'op-3',
    partId: 'part-2',
    toPartId: 'part-1',
    connectors: [
      { typeId: BRACKET, side: '+z' },
      { typeId: BRACKET, side: '-z' },
    ],
  });
  const design = replayDesign(history);
  assert.deepEqual(
    design.connectors.map(({ jointId, side }) => [jointId, side]),
    [
      [JOINT, '+z'],
      [JOINT, '-z'],
    ],
  );
  const list = partsToBuy(design.resolved, design.connectors);
  assert.equal(list.connectors[0].quantity, 2);
  assert.deepEqual(list.pendingJoints, []);
});

test('a bracket sits outside both parts, against the side of B and on the face of A', () => {
  const [front] = connectorsOf(fastenWithBrackets(ab(), JOINT));
  assert.equal(front.name, '40 corner bracket of B');
  assert.deepEqual(front.box, {
    min: { x: -18, y: 40, z: 520 },
    max: { x: 18, y: 80, z: 560 },
  });
});

test('connectors are added and taken away one side at a time, in the same step', () => {
  const one = setConnector(ab(), JOINT, '-z', true);
  assert.equal(one.length, 3);
  assert.deepEqual(ofKind(one[2], 'fasten-joint').connectors, [{ typeId: BRACKET, side: '-z' }]);
  const two = setConnector(one, JOINT, '+z', true);
  assert.equal(two.length, 3);
  assert.deepEqual(
    ofKind(two[2], 'fasten-joint').connectors.map((connector) =>
      'side' in connector ? connector.side : 'bolts',
    ),
    ['-z', '+z'],
  );
  const back = setConnector(two, JOINT, '-z', false);
  assert.deepEqual(ofKind(back[2], 'fasten-joint').connectors, [{ typeId: BRACKET, side: '+z' }]);
  assert.equal(setConnector(back, JOINT, '+z', false).length, 2, 'no connectors, no step');
});

test('a bracket that would not rest on both parts is refused, naming them', () => {
  assert.throws(() => setConnector(ab(), JOINT, '+x', true), /would not rest on A/);
  assert.throws(() => setConnector(ab(), 'part-1@part-2', '+z', true), /joint/);
});

test('a part moved so that its bracket would hang off fails the step that fastens it', () => {
  const fastened = fastenWithBrackets(ab(), JOINT);
  const moved = editProfile(fastened, 'part-2', { alongMm: 30 });
  assert.match(
    present(replayDesign(moved).failures.get('op-3'), 'failure of op-3'),
    /would not rest on A/,
  );
  assert.deepEqual(connectorsOf(moved), []);
});

test('the joint and its connectors go with a removed part; a deleted one fails them', () => {
  const fastened = fastenWithBrackets(ab(), JOINT);
  const removed = replayDesign(removePart(fastened, 'part-1'));
  assert.equal(removed.failures.size, 0);
  assert.deepEqual(removed.connectors, []);
  const deleted = replayDesign(deleteOperation(fastened, 'op-2'));
  assert.match(present(deleted.failures.get('op-3'), 'failure of op-3'), /deleted/);
});

test('the joints of a part list their connectors and the sides that fit', () => {
  const [joint] = jointsOfPart(setConnector(ab(), JOINT, '-z', true), 'part-1');
  assert.deepEqual(joint, {
    jointId: JOINT,
    partName: 'B',
    toPartName: 'A',
    sides: ['-z'],
    fittingSides: ['+z', '-z'],
    alongSides: ['+z', '-z'],
    besideMetSides: [],
    bolts: null,
  });
});

test('a profile lying on a face, or butting an end, has no bracket that fits', () => {
  let history = ab();
  history = addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { name: 'L', way: '+z', lengthMm: 200 }),
  );
  assert.deepEqual(fittingSides(history, 'part-3@part-1'), []);
  assert.throws(() => fastenWithBrackets(history, 'part-3@part-1'), /No corner bracket fits/);
});

/**
 * A with C lying across its top, 700 mm from its back end, from A's right edge towards the
 * pilot's left.
 */
function crossing() {
  const history = ab();
  return addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), {
      name: 'C',
      way: '+x',
      alongMm: 700,
      acrossMm: -20,
      lengthMm: 300,
    }),
  );
}
const CROSSING = 'part-3@part-1';

test('a profile lying across another takes a corner bracket on each side along the other', () => {
  const history = fastenWithBrackets(crossing(), CROSSING);
  const design = replayDesign(history);
  assert.deepEqual(
    design.connectors.map(({ jointId, side }) => [jointId, side]),
    [
      [CROSSING, '+z'],
      [CROSSING, '-z'],
    ],
  );
  const pending = partsToBuy(design.resolved, design.connectors).pendingJoints;
  assert.deepEqual(
    pending.map(({ jointId }) => jointId),
    [JOINT],
    'only B to A is left to fasten',
  );
});

test('a bracket of a crossing stands against the side of C, over the width of A', () => {
  const [front] = connectorsOf(fastenWithBrackets(crossing(), CROSSING));
  assert.equal(front.name, '40 corner bracket of C');
  assert.deepEqual(front.box, {
    min: { x: -18, y: 40, z: 720 },
    max: { x: 18, y: 80, z: 760 },
  });
});

test('a crossing has a corner beside each profile on each side, where the legs rest', () => {
  // C starts at A's right edge, so there is no room under C to the right of A.
  assert.deepEqual(fittingSides(crossing(), CROSSING), ['+x', '+z', '-z']);
  const [joint] = jointsOfPart(crossing(), 'part-3');
  assert.deepEqual(joint.besideMetSides, ['+x']);
  assert.deepEqual(joint.alongSides, ['+z', '-z'], 'the quick action stays beside C');
});

test('a bracket beside the part below hangs against its side, under the part on top', () => {
  const history = setConnector(crossing(), CROSSING, '+x', true);
  const [left] = connectorsOf(history);
  assert.equal(left.name, '40 corner bracket of A');
  assert.deepEqual(left.box, {
    min: { x: 20, y: 0, z: 682 },
    max: { x: 60, y: 40, z: 718 },
  });
  assert.deepEqual(replayDesign(history).failures.size, 0);
});

test('a crossing near the end of the part below has no bracket on the side past the end', () => {
  const history = editProfile(crossing(), 'part-3', { alongMm: 980 });
  assert.deepEqual(fittingSides(history, CROSSING), ['+x', '-z']);
});

test('a profile that crosses only part of the width below has room only underneath it', () => {
  const history = editProfile(crossing(), 'part-3', { acrossMm: 0 });
  assert.deepEqual(fittingSides(history, CROSSING), ['+x']);
});

test('connectors take part in interference', () => {
  let history = fastenWithBrackets(ab(), JOINT);
  history = editProfile(addAnchoredProfile(history).history, 'part-3', {
    name: 'D',
    axis: 'x',
    lengthMm: 200,
    startMm: { x: -100, y: 60, z: 570 },
  });
  const checks = cadChecks({ history, ...replayDesign(history) });
  const interference = present(
    checks.find((check) => check.id === 'cad-interference'),
    'interference check',
  );
  assert.deepEqual(interference.items, ['D into 40 corner bracket of B: 10 mm front to back']);
  const pending = present(
    checks.find((check) => check.id === 'cad-pending-joints'),
    'pending joints check',
  );
  assert.deepEqual(pending.items, []);
});
