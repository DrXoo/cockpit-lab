import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import {
  addMode,
  deleteMode,
  designInMode,
  forgetSubassemblyInModes,
  partsOffIn,
  renameMode,
  setSubassemblyOn,
  subassemblyStateIn,
  type Mode,
} from '../../../../src/cockpit/cad/history/modes.ts';
import {
  appliedSubassemblies,
  makeSubassembly,
  type Subassembly,
} from '../../../../src/cockpit/cad/history/subassemblies.ts';
import { fastenWithBolts } from '../../../../src/cockpit/cad/history/fastening.ts';
import { deckHistory } from '../../../support/designs.ts';
import { present, withId } from '../../../support/lookups.ts';

/** The deck history with the Deck (part-2) and the Wheel plate inside it (part-3) as subassemblies. */
function grouped(): { history: Operation[]; subassemblies: Subassembly[] } {
  const history = deckHistory();
  const deck = makeSubassembly([], history, 'part-2');
  return { history, subassemblies: makeSubassembly(deck, history, 'part-3') };
}

const applied = ({ history, subassemblies }: ReturnType<typeof grouped>) =>
  appliedSubassemblies(subassemblies, replayDesign(history).resolved);

test('a new mode has every subassembly on, a name of its own and an id', () => {
  const modes = addMode(addMode([]));

  assert.deepEqual(modes, [
    { id: 'mode-1', name: 'Mode 1', takenOff: [] },
    { id: 'mode-2', name: 'Mode 2', takenOff: [] },
  ]);
});

test('a new mode takes an id and a name no other mode has', () => {
  const modes = addMode(deleteMode(addMode(addMode([])), 'mode-1'));

  assert.deepEqual(
    modes.map(({ id, name }) => [id, name]),
    [
      ['mode-2', 'Mode 2'],
      ['mode-3', 'Mode 3'],
    ],
  );
});

test('a mode is renamed, and a name left empty keeps the one it had', () => {
  const renamed = renameMode(addMode([]), 'mode-1', '  Flight ');

  assert.equal(renamed[0]?.name, 'Flight');
  assert.equal(renameMode(renamed, 'mode-1', '  ')[0]?.name, 'Flight');
});

test('a subassembly taken off in a mode takes its parts off, nested ones too', () => {
  const design = grouped();
  const [mode] = setSubassemblyOn(addMode([]), 'mode-1', 'part-2', false);

  assert.deepEqual(present(mode, 'the mode').takenOff, ['part-2']);
  assert.deepEqual(
    [...partsOffIn(present(mode, 'the mode'), applied(design))],
    ['part-2', 'part-3', 'part-4'],
  );
});

test('putting a subassembly back on a mode takes it out of what the mode takes off', () => {
  const off = setSubassemblyOn(addMode([]), 'mode-1', 'part-3', false);
  const back = setSubassemblyOn(off, 'mode-1', 'part-3', true);

  assert.deepEqual(withId(back, 'mode-1').takenOff, []);
  assert.deepEqual(setSubassemblyOn(off, 'mode-1', 'part-3', false), off);
});

test('a nested subassembly is off with its parent, whatever it says itself', () => {
  const design = grouped();
  const mode: Mode = { id: 'mode-1', name: 'Flight', takenOff: ['part-2'] };

  assert.equal(subassemblyStateIn(mode, applied(design), 'part-2'), 'off');
  assert.equal(subassemblyStateIn(mode, applied(design), 'part-3'), 'off-with-parent');
  assert.equal(subassemblyStateIn({ ...mode, takenOff: [] }, applied(design), 'part-3'), 'on');
});

test('a mode taking off a subassembly that no longer applies takes nothing off', () => {
  const mode: Mode = { id: 'mode-1', name: 'Flight', takenOff: ['part-9'] };

  assert.equal(partsOffIn(mode, applied(grouped())).size, 0);
});

test('an ungrouped subassembly is forgotten by every mode', () => {
  const modes: Mode[] = [
    { id: 'mode-1', name: 'Racing', takenOff: ['part-2', 'part-3'] },
    { id: 'mode-2', name: 'Flight', takenOff: ['part-3'] },
  ];

  assert.deepEqual(
    forgetSubassemblyInModes(modes, 'part-3').map(({ takenOff }) => takenOff),
    [['part-2'], []],
  );
});

test('the design in a mode leaves out the parts it takes off, with their joints', () => {
  const design = grouped();
  const replayed = replayDesign(design.history);
  const inMode = designInMode(replayed, new Set(['part-3', 'part-4']));

  assert.deepEqual([...inMode.resolved.keys()], ['part-1', 'part-2']);
  assert.deepEqual([...inMode.fitted.resolved.keys()], ['part-1', 'part-2']);
  assert.deepEqual(
    inMode.joints.map(({ id }) => id),
    ['part-2@part-1'],
  );
  assert.deepEqual(
    inMode.parts.map(({ id }) => id),
    ['part-1', 'part-2'],
  );
});

test('the design with nothing taken off is the design replayed', () => {
  const replayed = replayDesign(deckHistory());

  assert.equal(designInMode(replayed, new Set()), replayed);
});

test('the connectors of a joint to a part taken off are left out with it', () => {
  const history = fastenWithBolts(deckHistory(), 'part-3@part-2', 2);
  const replayed = replayDesign(history);
  const inMode = designInMode(replayed, new Set(['part-3', 'part-4']));

  assert.ok(replayed.connectors.length > 0);
  assert.deepEqual(inMode.connectors, []);
  assert.deepEqual(inMode.fitted.connectors, []);
});
