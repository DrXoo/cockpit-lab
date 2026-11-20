import test from 'node:test';
import assert from 'node:assert/strict';
import {
  designData,
  emptyDesign,
  readDesign,
  type CockpitDesign,
} from '../../src/cockpit/design.ts';
import { ofKind, present } from '../support/lookups.ts';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  replayDesign,
  type AddFoot,
  type AddPlate,
  type MountPeripheral,
  type Operation,
  type RemovePart,
} from '../../src/cockpit/cad/history/history.ts';
import { addAdjustment, editAdjustment } from '../../src/cockpit/cad/history/adjustments.ts';
import { deckHistory } from '../support/designs.ts';

const designWith = (count: number): CockpitDesign => {
  let history: Operation[] = [];
  for (let i = 0; i < count; i++) history = addAnchoredProfile(history).history;
  return { history, driver: { statureMm: 1750 } };
};
const stored = (design: CockpitDesign) => JSON.parse(JSON.stringify(designData(design)));

test('a new design starts with an empty history and a driver of 175 cm', () => {
  assert.deepEqual(emptyDesign(), { history: [], driver: { statureMm: 1750 } });
});

test('a design is stored as its history and its driver, in mm, and reads back the same', () => {
  const design = { history: [], driver: { statureMm: 1820 } };
  const data = designData(design);
  assert.deepEqual(data, { units: 'mm', history: [], driver: { statureMm: 1820 } });
  assert.deepEqual(readDesign(JSON.parse(JSON.stringify(data))), design);
});

test('a design saved without a driver opens with one of 175 cm', () => {
  assert.deepEqual(readDesign({ units: 'mm', history: [] }).driver, { statureMm: 1750 });
});

test('a driver must have a stature from 140 to 210 cm, and nothing else', () => {
  const withDriver = (driver: unknown) => () => readDesign({ units: 'mm', history: [], driver });
  assert.throws(withDriver({ statureMm: 1300 }), /stature/);
  assert.throws(withDriver({ statureMm: 2200 }), /stature/);
  assert.throws(withDriver({ statureMm: '1750' }), /stature/);
  assert.throws(withDriver({}), /stature/);
  assert.throws(withDriver({ statureMm: 1750, heightCm: 175 }), /heightCm/);
  assert.throws(withDriver(null), /driver/);
});

test('a design stores its subassemblies beside the history, and reads them back', () => {
  const design: CockpitDesign = {
    ...designWith(2),
    subassemblies: [{ name: 'Wheel deck', rootId: 'part-2' }],
  };
  assert.deepEqual(stored(design).subassemblies, [{ name: 'Wheel deck', rootId: 'part-2' }]);
  assert.deepEqual(readDesign(stored(design)), design);
});

test('a design without subassemblies stores none, as it was saved before', () => {
  assert.equal('subassemblies' in stored(designWith(1)), false);
  assert.equal('subassemblies' in stored({ ...designWith(1), subassemblies: [] }), false);
  assert.equal(readDesign(stored(designWith(1))).subassemblies, undefined);
});

test('a stored subassembly needs a name and a root, once each', () => {
  const withSubassemblies = (subassemblies: unknown) => () =>
    readDesign({ ...stored(designWith(2)), subassemblies });
  assert.throws(withSubassemblies({}), /subassemblies/);
  assert.throws(withSubassemblies([{ name: 'Deck' }]), /identifier/);
  assert.throws(withSubassemblies([{ name: 3, rootId: 'part-1' }]), /name/);
  assert.throws(withSubassemblies([{ name: 'Deck', rootId: 'part-1', parts: [] }]), /parts/);
  assert.throws(
    withSubassemblies([
      { name: 'Deck', rootId: 'part-1' },
      { name: 'Again', rootId: 'part-1' },
    ]),
    /part-1/,
  );
  const cleaned = readDesign({
    ...stored(designWith(2)),
    subassemblies: [{ name: ' <b>Deck</b> ', rootId: 'part-1' }],
  });
  assert.deepEqual(cleaned.subassemblies, [{ name: 'bDeck/b', rootId: 'part-1' }]);
});

test('a subassembly whose root the history no longer makes still opens', () => {
  const design = { ...designWith(1), subassemblies: [{ name: 'Gone', rootId: 'part-7' }] };
  assert.deepEqual(readDesign(stored(design)).subassemblies, design.subassemblies);
});

test('a design stores its modes and the mode shown beside the history, and reads them back', () => {
  const design: CockpitDesign = {
    ...designWith(2),
    subassemblies: [{ name: 'Wheel deck', rootId: 'part-2' }],
    modes: [
      { id: 'mode-1', name: 'Racing', takenOff: [] },
      { id: 'mode-2', name: 'Flight', takenOff: ['part-2'] },
    ],
    shownModeId: 'mode-2',
  };
  assert.deepEqual(stored(design).modes, design.modes);
  assert.equal(stored(design).shownModeId, 'mode-2');
  assert.deepEqual(readDesign(stored(design)), design);
});

/** The deck design, its wheel base (part-4) 20 mm along a 100 mm travel, with two modes. */
function fittedInTwoModes(flight: unknown): Record<string, unknown> {
  const history = editAdjustment(addAdjustment(deckHistory(), 'part-4'), 'part-4', {
    positionMm: 20,
  });
  return {
    ...stored({ history, driver: { statureMm: 1750 } }),
    subassemblies: [{ name: 'Deck', rootId: 'part-2' }],
    modes: [{ id: 'mode-1', name: 'Racing', takenOff: [] }, flight],
  };
}

test('a later mode stores where each adjustment is in it, and reads it back', () => {
  const data = fittedInTwoModes({
    id: 'mode-2',
    name: 'Flight',
    takenOff: [],
    positionsMm: { 'part-4': -30 },
  });

  assert.deepEqual(stored(readDesign(data)), data);
});

test('a later mode stored without positions takes those of the operations', () => {
  const data = fittedInTwoModes({ id: 'mode-2', name: 'Flight', takenOff: [] });

  assert.deepEqual(readDesign(data).modes?.[1]?.positionsMm, { 'part-4': 20 });
});

test('stored positions must be numbers of adjustments the design has, within their travel', () => {
  const flight = (positionsMm: unknown) => () =>
    readDesign(fittedInTwoModes({ id: 'mode-2', name: 'Flight', takenOff: [], positionsMm }));

  assert.throws(flight([]), /positions/);
  assert.throws(flight({ 'part-4': '3' }), /number/);
  assert.throws(flight({ 'part-3': 0 }), /no adjustment/);
  assert.throws(flight({ 'part-4': 80 }), /travel/);
});

test('a design without modes stores none, and shows all its parts', () => {
  const design = { ...designWith(1), modes: [] };
  assert.equal('modes' in stored(design), false);
  assert.equal('shownModeId' in stored(design), false);
  assert.equal(readDesign(stored(designWith(1))).modes, undefined);
});

test('a stored mode needs an id, a name and subassemblies of the design to take off', () => {
  const withModes = (modes: unknown, shownModeId?: unknown) => () =>
    readDesign({
      ...stored(designWith(2)),
      subassemblies: [{ name: 'Deck', rootId: 'part-2' }],
      modes,
      ...(shownModeId === undefined ? {} : { shownModeId }),
    });
  const mode = { id: 'mode-1', name: 'Flight', takenOff: ['part-2'] };
  assert.throws(withModes({}), /modes/);
  assert.throws(withModes([{ ...mode, id: '' }]), /identifier/);
  assert.throws(withModes([{ ...mode, name: 3 }]), /name/);
  assert.throws(withModes([{ ...mode, positions: {} }]), /positions/);
  assert.throws(withModes([mode, { ...mode, name: 'Again' }]), /mode-1/);
  assert.throws(withModes([{ ...mode, takenOff: 'part-2' }]), /takes off/);
  assert.throws(withModes([{ ...mode, takenOff: ['part-1'] }]), /part-1/);
  assert.throws(withModes([mode], 'mode-9'), /mode-9/);
  const cleaned = readDesign({
    ...stored(designWith(2)),
    modes: [{ id: 'mode-1', name: ' <i>Flight</i> ', takenOff: [] }],
  });
  assert.equal(cleaned.modes?.[0]?.name, 'iFlight/i');
});

test('a stored design must state mm and hold a history', () => {
  assert.throws(() => readDesign({ units: 'cm', history: [] }), /units/);
  assert.throws(() => readDesign({ history: [] }), /units/);
  assert.throws(() => readDesign({ units: 'mm' }), /history/);
  assert.throws(() => readDesign({ units: 'mm', history: {} }), /history/);
  assert.throws(() => readDesign(null), /Invalid cockpit design/);
  assert.throws(() => readDesign([]), /Invalid cockpit design/);
});

test('an operation this version does not know is rejected, not skipped', () => {
  assert.throws(
    () => readDesign({ units: 'mm', history: [{ kind: 'add-sliding-seat' }] }),
    /Unknown operation/,
  );
});

test('a history of anchored profiles reads back with the same values', () => {
  const design = {
    ...designWith(2),
    history: editProfile(designWith(2).history, 'part-2', { name: 'Seat rail' }),
  };
  assert.deepEqual(readDesign(stored(design)), design);
});

test('an anchored profile with values it cannot have is rejected', () => {
  const data = stored(designWith(1));
  const withValues = (changes: object) => ({
    ...data,
    history: [{ ...data.history[0], ...changes }],
  });
  assert.throws(() => readDesign(withValues({ lengthMm: 0 })), /length/);
  assert.throws(() => readDesign(withValues({ lengthMm: '500' })), /length/);
  assert.throws(() => readDesign(withValues({ startMm: { x: 0, y: 20 } })), /position/);
  assert.throws(() => readDesign(withValues({ sectionId: '45x45' })), /section/);
  assert.throws(() => readDesign(withValues({ systemId: 'other' })), /system/);
  assert.throws(() => readDesign(withValues({ heightAxis: 'z' })), /height/);
  assert.throws(() => readDesign(withValues({ name: 7 })), /name/);
  assert.throws(() => readDesign(withValues({ partId: '' })), /identifier/);
});

test('a stored name is cleaned as a typed one is', () => {
  const data = stored(designWith(1));
  data.history[0].name = ' <i>Rail</i> ';
  assert.equal(ofKind(readDesign(data).history[0], 'add-anchored-profile').name, 'iRail/i');
});

test('a history that repeats an identifier is rejected', () => {
  const data = stored(designWith(2));
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], { ...data.history[1], id: 'op-1' }] }),
    /op-1/,
  );
  assert.throws(
    () =>
      readDesign({ ...data, history: [data.history[0], { ...data.history[1], partId: 'part-1' }] }),
    /part-1/,
  );
});

const withGrowth = () => {
  const { history } = designWith(1);
  return { ...designWith(1), history: addOperation(history, draftGrowth(history, 'part-1')) };
};

test('a profile grown out of another reads back with its place on the face', () => {
  const design = withGrowth();
  assert.deepEqual(readDesign(stored(design)), design);
});

test('a stored growth that no longer applies reads back as a failed operation', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
  const reordered = readDesign({ ...data, history: [growth, rail] });
  assert.match(
    present(replayDesign(reordered.history).failures.get('op-2'), 'failure of op-2'),
    /later step/,
  );
  const off = readDesign({ ...data, history: [rail, { ...growth, alongMm: 600 }] });
  assert.match(
    present(replayDesign(off.history).failures.get('op-2'), 'failure of op-2'),
    /hang off/,
  );
});

test('a stored growth holds the values of its kind, and nothing else', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
  assert.throws(() => readDesign({ ...data, history: [rail, { ...growth, face: 'up' }] }), /face/);
  assert.throws(() => readDesign({ ...data, history: [rail, { ...growth, way: 'in' }] }), /way/);
  assert.throws(
    () => readDesign({ ...data, history: [rail, { ...growth, startMm: { x: 0, y: 0, z: 0 } }] }),
    /startMm/,
  );
});

test('a profile lying on a face reads back, and one lying towards its face is rejected', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
  const lying = { ...data, history: [rail, { ...growth, way: '+x' }] };
  assert.equal(ofKind(readDesign(lying).history[1], 'grow-profile').way, '+x');
  assert.throws(() => readDesign({ ...data, history: [rail, { ...growth, way: '-y' }] }), /way/);
});

test('a span reads back with the part it reaches, or with an open end once it is gone', () => {
  let { history } = designWith(2);
  history = editProfile(history, 'part-2', { startMm: { x: 500, y: 20, z: 0 } });
  history = addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { face: '+x', alongMm: 250 }),
  );
  history = editProfile(history, 'part-3', { reachesId: 'part-2' });
  const data = stored({ ...designWith(0), history });
  assert.deepEqual(readDesign(data), { ...designWith(0), history });
  const lost = { ...data.history[2], reachesId: 'part-8' };
  const read = readDesign({ ...data, history: [data.history[0], data.history[1], lost] });
  assert.equal(present(replayDesign(read.history).resolved.get('part-3'), 'part-3').openEnd, true);
});

test('a removal reads back, and must name the part it removes', () => {
  const { history } = designWith(1);
  const removal: RemovePart = { kind: 'remove-part', id: 'op-2', removedId: 'part-1' };
  assert.deepEqual(
    readDesign(stored({ ...emptyDesign(), history: [...history, removal] })).history[1],
    removal,
  );
  const data = stored({ ...emptyDesign(), history: [...history, removal] });
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], { ...removal, removedId: 7 }] }),
    /identifier/,
  );
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], { ...removal, extra: 1 }] }),
    /extra/,
  );
});

test('a peripheral with a grip reads back with the hand that uses it', () => {
  const { history } = designWith(1);
  const throttle: MountPeripheral = {
    kind: 'mount-peripheral',
    id: 'op-2',
    partId: 'part-2',
    name: 'Throttle',
    typeId: 'generic-throttle',
    category: 'throttle',
    envelope: { widthMm: 200, heightMm: 200, depthMm: 260 },
    mountingPattern: { holes: [] },
    contactPoints: [{ role: 'grip', offsetMm: { x: 0, y: 170, z: 0 } }],
    source: { kind: 'estimated', reference: 'Typical of the kind' },
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'start',
    alongMm: 300,
    acrossMm: 0,
    facing: '+z',
    hand: 'right',
  };
  const data = stored({ ...emptyDesign(), history: [...history, throttle] });
  assert.deepEqual(readDesign(data).history[1], throttle);
  const withThrottle = (changes: object) => ({
    ...data,
    history: [data.history[0], { ...throttle, ...changes }],
  });
  assert.throws(() => readDesign(withThrottle({ hand: 'both' })), /which hand/);
  assert.throws(() => readDesign(withThrottle({ hand: undefined })), /which hand/);
});

test('a peripheral reads back with the side whose holes rest on its place', () => {
  const { history } = designWith(1);
  const pedals: MountPeripheral = {
    kind: 'mount-peripheral',
    id: 'op-2',
    partId: 'part-2',
    name: 'Pedals',
    typeId: 'generic-pedals',
    category: 'pedals',
    envelope: { widthMm: 400, heightMm: 200, depthMm: 320 },
    mountingPattern: { holes: [{ xMm: -160, yMm: 120, diameterMm: 8.5 }] },
    contactPoints: [{ role: 'heel', offsetMm: { x: 0, y: 30, z: -130 } }],
    source: { kind: 'estimated', reference: 'Typical of the kind' },
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'start',
    alongMm: 300,
    acrossMm: 0,
    facing: '+z',
    holesOver: 'right',
  };
  const data = stored({ ...emptyDesign(), history: [...history, pedals] });
  assert.deepEqual(readDesign(data).history[1], pedals);
  const withSide = (holesOver: unknown) => ({
    ...data,
    history: [data.history[0], { ...pedals, holesOver }],
  });
  assert.throws(() => readDesign(withSide('middle')), /side of a mounting pattern/);
});

test('a mounted peripheral reads back with the values copied from its type and its place', () => {
  const { history } = designWith(1);
  const pedals: MountPeripheral = {
    kind: 'mount-peripheral',
    id: 'op-2',
    partId: 'part-2',
    name: 'Pedals',
    typeId: 'generic-pedals',
    category: 'pedals',
    envelope: { widthMm: 400, heightMm: 200, depthMm: 320 },
    mountingPattern: { holes: [{ xMm: -160, yMm: 120, diameterMm: 8.5 }] },
    contactPoints: [{ role: 'heel', offsetMm: { x: 0, y: 30, z: -130 } }],
    source: { kind: 'measured', reference: 'Measured on my own pedals' },
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'end',
    alongMm: 200,
    acrossMm: 0,
    facing: '+z',
  };
  const seat: MountPeripheral = {
    ...pedals,
    id: 'op-3',
    partId: 'part-3',
    name: 'Seat',
    typeId: 'generic-seat',
    category: 'seat',
    contactPoints: [{ role: 'hip', offsetMm: { x: 0, y: 110, z: -170 } }],
    backrestDeg: 25,
    fromEnd: 'start',
  };
  const data = stored({ ...emptyDesign(), history: [...history, pedals, seat] });
  assert.deepEqual(readDesign(data).history.slice(1), [pedals, seat]);
  const withPedals = (changes: object) => ({
    ...data,
    history: [data.history[0], { ...pedals, ...changes }],
  });
  // A type the catalog no longer has still opens: its values are in the step.
  assert.equal(
    ofKind(readDesign(withPedals({ typeId: 'retired-pedals' })).history[1], 'mount-peripheral')
      .typeId,
    'retired-pedals',
  );
  assert.throws(() => readDesign(withPedals({ category: 'hotas' })), /hotas/);
  assert.throws(
    () => readDesign(withPedals({ envelope: { widthMm: 400, heightMm: 200 } })),
    /depth/,
  );
  assert.throws(
    () => readDesign(withPedals({ envelope: { ...pedals.envelope, heightMm: 5 } })),
    /between 10 and 2000/,
  );
  assert.throws(
    () =>
      readDesign(withPedals({ mountingPattern: { holes: [{ xMm: 0, yMm: '0', diameterMm: 8 }] } })),
    /number/,
  );
  assert.throws(
    () =>
      readDesign(withPedals({ contactPoints: [{ role: 'knee', offsetMm: { x: 0, y: 0, z: 0 } }] })),
    /knee/,
  );
  assert.throws(() => readDesign(withPedals({ backrestDeg: '25' })), /number/);
  assert.throws(
    () => readDesign(withPedals({ source: { kind: 'guessed', reference: '' } })),
    /source/,
  );
  assert.throws(() => readDesign(withPedals({ facing: '-y' })), /faces along/);
  assert.throws(() => readDesign(withPedals({ turns: 1 })), /turns/);
  assert.throws(
    () => readDesign(withPedals({ envelope: { ...pedals.envelope, colour: 'red' } })),
    /colour/,
  );
});

test('a foot reads back with its type and its place under the profile', () => {
  const { history } = designWith(1);
  const foot: AddFoot = {
    kind: 'add-foot',
    id: 'op-2',
    partId: 'part-2',
    name: 'Leveling foot 2',
    footTypeId: 'leveling-foot',
    parentId: 'part-1',
    fromEnd: 'start',
    alongMm: 36,
  };
  const data = stored({ ...emptyDesign(), history: [...history, foot] });
  assert.deepEqual(readDesign(data).history[1], foot);
  const withFoot = (changes: object) => ({
    ...data,
    history: [data.history[0], { ...foot, ...changes }],
  });
  assert.throws(() => readDesign(withFoot({ footTypeId: 'wheel' })), /wheel/);
  assert.throws(() => readDesign(withFoot({ alongMm: '36' })), /number/);
  assert.throws(() => readDesign(withFoot({ face: '-y' })), /face/);
});

test('a plate reads back with its sheet, its process, its size and its place on the profile', () => {
  const { history } = designWith(1);
  const plate: AddPlate = {
    kind: 'add-plate',
    id: 'op-2',
    partId: 'part-2',
    name: 'Wheel plate',
    sheetId: 'aluminium-8',
    processId: 'hand-drilling',
    widthMm: 300,
    depthMm: 250,
    depthAxis: 'z',
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'end',
    alongMm: 120,
    acrossMm: 15,
  };
  const data = stored({ ...emptyDesign(), history: [...history, plate] });
  assert.deepEqual(readDesign(data).history[1], plate);
  const withPlate = (changes: object) => ({
    ...data,
    history: [data.history[0], { ...plate, ...changes }],
  });
  assert.throws(() => readDesign(withPlate({ sheetId: 'steel-2' })), /steel-2/);
  assert.throws(() => readDesign(withPlate({ processId: 'plasma' })), /plasma/);
  const savedBefore: Record<string, unknown> = { ...plate };
  delete savedBefore.processId;
  const before = { ...data, history: [data.history[0], savedBefore] };
  assert.equal(
    ofKind(readDesign(before).history[1], 'add-plate').processId,
    'laser-cutting',
    'a plate saved before it had a process is laser cut',
  );
  assert.throws(() => readDesign(withPlate({ widthMm: '300' })), /number/);
  assert.throws(() => readDesign(withPlate({ depthMm: 20 })), /between 50 and 1500/);
  assert.throws(() => readDesign(withPlate({ depthAxis: 'y' })), /depth/);
  assert.throws(() => readDesign(withPlate({ lengthMm: 300 })), /lengthMm/);
});

test('a fastening reads back with its connectors, once per joint', async () => {
  const { fastenWithBrackets } = await import('../../src/cockpit/cad/history/fastening.ts');
  const base = editProfile(addAnchoredProfile([]).history, 'part-1', { lengthMm: 1000 });
  const grown = addOperation(base, editDraft(base, draftGrowth(base, 'part-1'), {}));
  const history = fastenWithBrackets(grown, 'part-2@part-1');
  const data = stored({ ...emptyDesign(), history });
  assert.deepEqual(readDesign(data).history, history);
  const fastening = data.history[2];
  const withFastening = (changes: object) => ({
    ...data,
    history: [data.history[0], data.history[1], { ...fastening, ...changes }],
  });
  assert.throws(
    () => readDesign(withFastening({ connectors: [{ typeId: 'glue', side: '+z' }] })),
    /glue/,
  );
  assert.throws(
    () => readDesign(withFastening({ connectors: [{ typeId: 'corner-bracket-40', side: 'up' }] })),
    /face/,
  );
  assert.throws(() => readDesign(withFastening({ connectors: [] })), /at least one/);
  assert.throws(() => readDesign(withFastening({ jointId: 'x' })), /jointId/);
  const twice = { ...data, history: [...data.history, { ...fastening, id: 'op-4' }] };
  assert.throws(() => readDesign(twice), /twice/);
});

test('a plate fastened with bolts reads back with the bolts in each slot', async () => {
  const { fastenWithBolts } = await import('../../src/cockpit/cad/history/fastening.ts');
  const { draftPlate } = await import('../../src/cockpit/cad/history/plates.ts');
  const base = editProfile(addAnchoredProfile([]).history, 'part-1', { lengthMm: 1000 });
  const plated = addOperation(base, draftPlate(base, 'part-1'));
  const history = fastenWithBolts(plated, 'part-2@part-1', 2);
  const data = stored({ ...emptyDesign(), history });
  assert.deepEqual(readDesign(data).history, history);
  const withBolts = (bolts: object) => ({
    ...data,
    history: [data.history[0], data.history[1], { ...data.history[2], connectors: [bolts] }],
  });
  assert.throws(() => readDesign(withBolts({ typeId: 'plate-bolt-m8', perSlot: '2' })), /number/);
  assert.throws(() => readDesign(withBolts({ typeId: 'plate-bolt-m8', perSlot: 0 })), /between/);
  assert.throws(
    () => readDesign(withBolts({ typeId: 'plate-bolt-m8', perSlot: 2, side: '+y' })),
    /side/,
  );
});
