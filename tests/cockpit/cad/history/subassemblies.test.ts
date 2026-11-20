import test from 'node:test';
import assert from 'node:assert/strict';
import {
  editProfile,
  removePart,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import {
  appliedSubassemblies,
  innermostSubassembly,
  makeSubassembly,
  renameSubassembly,
  spansReachingSubassemblies,
  subassemblyOfEachStep,
  ungroupSubassembly,
  type Subassembly,
} from '../../../../src/cockpit/cad/history/subassemblies.ts';
import {
  growthTowardsRail,
  railHistory,
  withGrowth,
  withPeripheral,
  withPlate,
} from '../../../support/designs.ts';
import { present } from '../../../support/lookups.ts';

/**
 * The rail (part-1) with a Deck grown out of its top (part-2), a plate on the deck (part-3) and
 * a wheel base on the plate (part-4).
 */
function deckHistory(): Operation[] {
  const deck = withGrowth(railHistory(), 'part-1', { name: 'Deck', face: '+y', alongMm: 500 });
  const plated = withPlate(deck, 'part-2', { name: 'Wheel plate', face: '+z' });
  return withPeripheral(plated, 'part-3', 'generic-wheel-base', { face: '+z' });
}

const applied = (history: readonly Operation[], subassemblies: readonly Subassembly[]) =>
  appliedSubassemblies(subassemblies, replayDesign(history).resolved);

test('a subassembly holds its root and everything that hangs from it', () => {
  const history = deckHistory();
  const [deck] = applied(history, makeSubassembly([], history, 'part-2'));

  assert.equal(deck?.name, 'Deck');
  assert.deepEqual(deck?.partIds, ['part-2', 'part-3', 'part-4']);
  assert.equal(deck?.parentRootId, null);
});

test('a part added later to a part of a subassembly belongs to it', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly([], history, 'part-2');
  const later = withGrowth(history, 'part-2', { face: '-x' });

  assert.ok(present(applied(later, subassemblies)[0], 'the deck').partIds.includes('part-5'));
});

test('an anchored part can be the root of a subassembly', () => {
  const history = deckHistory();
  const [frame] = applied(history, makeSubassembly([], history, 'part-1'));

  assert.deepEqual(frame?.partIds, ['part-1', 'part-2', 'part-3', 'part-4']);
});

test('a part belongs to the innermost subassembly that holds it', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly(makeSubassembly([], history, 'part-2'), history, 'part-3');
  const found = applied(history, subassemblies);

  assert.equal(innermostSubassembly(found, 'part-4')?.rootId, 'part-3');
  assert.equal(innermostSubassembly(found, 'part-2')?.rootId, 'part-2');
  assert.equal(innermostSubassembly(found, 'part-1'), undefined);
  assert.equal(innermostSubassembly(found, 'part-3')?.parentRootId, 'part-2');
});

test('a subassembly whose root is removed no longer applies from that step on', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly([], history, 'part-2');
  const removed = removePart(history, 'part-2', history.length);

  assert.deepEqual(applied(removed, subassemblies), []);
  const before = replayDesign(removed, history.length).resolved;
  assert.equal(appliedSubassemblies(subassemblies, before).length, 1);
});

test('a part removed inside a subassembly leaves what hung from it outside, anchored', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly([], history, 'part-2');
  const removed = removePart(history, 'part-3', history.length);

  assert.deepEqual(applied(removed, subassemblies)[0]?.partIds, ['part-2']);
});

test('a span outside a subassembly that reaches one of its parts is reported', () => {
  // B (part-3) hangs from A (part-1) and spans to C (part-2).
  const history = editProfile(growthTowardsRail(), 'part-3', { reachesId: 'part-2' });
  const { resolved } = replayDesign(history);
  const reaching = (rootId: string) =>
    spansReachingSubassemblies(
      appliedSubassemblies(makeSubassembly([], history, rootId), resolved),
      resolved,
    );

  assert.deepEqual(reaching('part-2'), [
    { spanId: 'part-3', reachesId: 'part-2', rootId: 'part-2' },
  ]);
  assert.deepEqual(reaching('part-1'), []);
});

test('making a subassembly names it after its root, and refuses a part already a root', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly([], history, 'part-2');

  assert.deepEqual(subassemblies, [{ name: 'Deck', rootId: 'part-2' }]);
  assert.throws(() => makeSubassembly(subassemblies, history, 'part-2'), /already/);
  assert.throws(() => makeSubassembly([], history, 'part-9'), /no part/);
});

test('a subassembly is renamed as its root says, and ungrouped without removing parts', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly([], history, 'part-2');

  assert.deepEqual(renameSubassembly(subassemblies, 'part-2', '  Wheel deck '), [
    { name: 'Wheel deck', rootId: 'part-2' },
  ]);
  assert.deepEqual(renameSubassembly(subassemblies, 'part-2', '   '), subassemblies);
  assert.deepEqual(ungroupSubassembly(subassemblies, 'part-2'), []);
});

test('each step that makes a part is tagged with the subassembly the part belongs to', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly(makeSubassembly([], history, 'part-2'), history, 'part-3');
  const tags = subassemblyOfEachStep(history, subassemblies, history.length);

  assert.deepEqual(
    history.map((operation) => tags.get(operation.id)?.rootId ?? null),
    [null, 'part-2', 'part-3', 'part-3'],
  );
});

test('steps after the history marker are tagged as the whole design has them', () => {
  const history = deckHistory();
  const subassemblies = makeSubassembly([], history, 'part-2');
  const tags = subassemblyOfEachStep(history, subassemblies, 1);

  assert.equal(tags.get(present(history[3], 'the wheel base step').id)?.name, 'Deck');
});
