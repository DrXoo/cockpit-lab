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
} from '../src/cad/history.ts';
import {
  fastenWithBrackets,
  fittingSides,
  jointsOfPart,
  setConnector,
} from '../src/cad/fastening.ts';
import { partsToBuy } from '../src/cad/parts-to-buy.ts';
import { cadChecks } from '../src/cad-checks.ts';

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
const connectorsOf = (history) => replayDesign(history).connectors;

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
  assert.deepEqual(one[2].connectors, [{ typeId: BRACKET, side: '-z' }]);
  const two = setConnector(one, JOINT, '+z', true);
  assert.equal(two.length, 3);
  assert.deepEqual(
    two[2].connectors.map((connector) => connector.side),
    ['-z', '+z'],
  );
  const back = setConnector(two, JOINT, '-z', false);
  assert.deepEqual(back[2].connectors, [{ typeId: BRACKET, side: '+z' }]);
  assert.equal(setConnector(back, JOINT, '+z', false).length, 2, 'no connectors, no step');
});

test('a bracket that would not rest on both parts is refused, naming them', () => {
  assert.throws(() => setConnector(ab(), JOINT, '+x', true), /would not rest on A/);
  assert.throws(() => setConnector(ab(), 'part-1@part-2', '+z', true), /joint/);
});

test('a part moved so that its bracket would hang off fails the step that fastens it', () => {
  const fastened = fastenWithBrackets(ab(), JOINT);
  const moved = editProfile(fastened, 'part-2', { alongMm: 30 });
  assert.match(replayDesign(moved).failures.get('op-3'), /would not rest on A/);
  assert.deepEqual(connectorsOf(moved), []);
});

test('the joint and its connectors go with a removed part; a deleted one fails them', () => {
  const fastened = fastenWithBrackets(ab(), JOINT);
  const removed = replayDesign(removePart(fastened, 'part-1'));
  assert.equal(removed.failures.size, 0);
  assert.deepEqual(removed.connectors, []);
  const deleted = replayDesign(deleteOperation(fastened, 'op-2'));
  assert.match(deleted.failures.get('op-3'), /deleted/);
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

test('connectors take part in interference', () => {
  let history = fastenWithBrackets(ab(), JOINT);
  history = editProfile(addAnchoredProfile(history).history, 'part-3', {
    name: 'D',
    axis: 'x',
    lengthMm: 200,
    startMm: { x: -100, y: 60, z: 570 },
  });
  const checks = cadChecks({ history, ...replayDesign(history) });
  const interference = checks.find((check) => check.id === 'cad-interference');
  assert.deepEqual(interference.items, ['D into 40 corner bracket of B: 10 mm front to back']);
  const pending = checks.find((check) => check.id === 'cad-pending-joints');
  assert.deepEqual(pending.items, []);
});
