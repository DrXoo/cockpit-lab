import test from 'node:test';
import assert from 'node:assert/strict';
import { partsToBuyHTML } from '../../../src/cockpit/editor/parts-view.ts';
import type { Cut } from '../../../src/cockpit/cad/output/cuts.ts';
import type { PartsToBuy } from '../../../src/cockpit/cad/output/parts-to-buy.ts';

const cut = (sectionId: string, lengthMm: number, names: string[]): Cut => ({
  systemId: 'motedis-40-i-slot-8',
  sectionId,
  lengthMm,
  quantity: names.length,
  names,
});
const nothing: PartsToBuy = {
  cuts: [],
  plates: [],
  connectors: [],
  fasteners: [],
  feet: [],
  pendingJoints: [],
};
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

test('the cuts are listed by section and length, with the names of their parts', () => {
  const html = partsToBuyHTML({
    ...nothing,
    cuts: [cut('40x80', 1200, ['Left rail', 'Right rail']), cut('40x40', 460, ['Crossmember'])],
  });
  assert.match(textOf(html), /2 × 40 × 80 profile, 1200 mm Left rail, Right rail/);
  assert.match(textOf(html), /1 × 40 × 40 profile, 460 mm Crossmember/);
  assert.equal(html.match(/data-buy="cut"/g)?.length, 2);
});

test('connectors, fasteners and feet are counted, and estimated items say so', () => {
  const html = partsToBuyHTML({
    ...nothing,
    cuts: [cut('40x40', 500, ['A'])],
    connectors: [{ typeId: 'corner-bracket-40', name: '40 corner bracket', quantity: 2 }],
    fasteners: [
      { id: 'bolt-m8', quantity: 8 },
      { id: 't-nut-slot-8-m8', quantity: 8 },
    ],
    feet: [{ typeId: 'leveling-foot', name: 'Leveling foot', quantity: 4 }],
  });
  const text = textOf(html);
  assert.match(text, /2 × 40 corner bracket Estimated: check the data sheet/);
  assert.match(text, /8 × M8 bolt/);
  assert.match(text, /8 × T-nut, slot 8, M8/);
  assert.match(text, /4 × Leveling foot Estimated: check the data sheet/);
});

test('pending joints are a warning that the list is not complete yet', () => {
  const html = partsToBuyHTML({
    ...nothing,
    cuts: [cut('40x40', 500, ['A', 'B'])],
    pendingJoints: [{ jointId: 'part-2@part-1', partName: 'B', toPartName: 'A' }],
  });
  assert.match(textOf(html), /⚠ 1 joint has no connectors yet/);
  assert.doesNotMatch(html, /data-buy="connector"/);
});

test('names are escaped, as the user typed them', () => {
  const html = partsToBuyHTML({ ...nothing, cuts: [cut('40x40', 500, ['<b>A</b>'])] });
  assert.match(html, /&lt;b&gt;A&lt;\/b&gt;/);
});

test('plates are listed by size and sheet, with their parts, and the sheet is estimated', () => {
  const html = partsToBuyHTML({
    ...nothing,
    plates: [
      {
        sheetId: 'aluminium-8',
        longSideMm: 300,
        shortSideMm: 250,
        quantity: 2,
        names: ['Wheel plate', 'Pedal plate'],
      },
    ],
  });
  assert.match(
    textOf(html),
    /Plates 2 × 300 × 250 mm plate, Aluminium sheet, 8 mm Wheel plate, Pedal plate · Estimated sheet: check the supplier/,
  );
  assert.equal(html.match(/data-buy="plate"/g)?.length, 1);
});

test('the bolts of plates say their length is estimated', () => {
  const html = partsToBuyHTML({
    ...nothing,
    fasteners: [
      { id: 'bolt-m8x16', quantity: 4 },
      { id: 't-nut-slot-8-m8', quantity: 4 },
    ],
  });
  assert.match(textOf(html), /4 × M8 × 16 bolt Estimated: check the data sheet/);
  assert.doesNotMatch(textOf(html), /T-nut, slot 8, M8 (Estimated|Counted)/);
});
