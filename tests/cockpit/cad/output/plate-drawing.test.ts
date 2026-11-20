import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import { fastenWithBolts } from '../../../../src/cockpit/cad/history/fastening.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';
import { holesOfPlate } from '../../../../src/cockpit/cad/parts/plate-holes.ts';
import {
  holeDescription,
  plateDrawingSvg,
} from '../../../../src/cockpit/cad/output/plate-drawing.ts';
import { railHistory, withPeripheral, withPlate } from '../../../support/designs.ts';
import { ofKind, present } from '../../../support/lookups.ts';

// Reference case from docs/mini-cad.md: a 200 × 150 × 5 mm plate with four holes 120 × 80 apart.
const referencePattern = {
  holes: [
    { xMm: -60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: 40, diameterMm: 6.5 },
    { xMm: -60, yMm: 40, diameterMm: 6.5 },
  ],
};

function referenceDesign(face: '+y' | '-y' = '+y'): Operation[] {
  const plated = withPlate(railHistory(), 'part-1', {
    name: 'Reference plate',
    widthMm: 200,
    depthMm: 150,
    sheetId: 'aluminium-5',
    face,
  });
  return withPeripheral(plated, 'part-2', 'generic-wheel-base', {
    name: 'Wheel base',
    face,
    mountingPattern: referencePattern,
  });
}

function drawingOf(history: readonly Operation[]) {
  const design = replayDesign(history);
  const plate = ofKind(design.resolved.get('part-2')?.part, 'plate');
  const holes = holesOfPlate(design, 'part-2');
  return { svg: plateDrawingSvg(plate, holes), holes, plate };
}

const toThousandths = (value: number) => Math.round(value * 1000) / 1000 || 0;

const texts = (svg: string) =>
  [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

test('the drawing outlines the plate at 1:1 in mm, centered on its center', () => {
  const { svg } = drawingOf(referenceDesign());
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /<rect [^>]*x="-100" y="-75" width="200" height="150"/);
});

test('each hole is a circle where the plate puts it, up the page as the drawing goes up', () => {
  const { svg, holes } = drawingOf(referenceDesign());
  const circles = [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)].map(
    (match) => match.slice(1).map(Number),
  );
  assert.deepEqual(
    circles,
    holes.map((hole) => [hole.xMm, -hole.yMm, hole.diameterMm / 2].map(toThousandths)),
  );
  assert.equal(circles.length, 4);
});

test('each hole is named after what puts it there, with its diameter and where it is', () => {
  const { svg, holes, plate } = drawingOf(referenceDesign());
  const first = present(holes[0], 'the first hole');
  const described = holeDescription(plate, first);
  assert.equal(
    described,
    'Wheel base, hole 1: mounting hole ⌀6.5 mm, 160 mm from the left edge and 35 mm from the bottom edge',
  );
  assert.ok(svg.includes(`<title>${described}</title>`));
  assert.match(svg, /data-hole="0"/);
});

test('the dimensions give the plate size and each row and column of holes from the bottom left corner', () => {
  const shown = texts(drawingOf(referenceDesign()).svg);
  for (const expected of ['200', '150', '40', '160', '35', '115'])
    assert.ok(shown.includes(expected), `${expected} in ${shown.join(', ')}`);
  assert.equal(shown.filter((text) => text === '40').length, 1);
});

test('an arrow says which way up the page is on the cockpit, and the side it is seen from', () => {
  const shown = texts(drawingOf(referenceDesign()).svg);
  assert.ok(shown.includes('↑ front'), shown.join(', '));
  assert.ok(
    shown.includes('Reference plate · 200 × 150 mm · Aluminium sheet, 5 mm · seen from above'),
    shown.join(', '),
  );
  const below = texts(drawingOf(referenceDesign('-y')).svg);
  assert.ok(
    below.some((text) => text.endsWith('seen from below')),
    below.join(', '),
  );
});

test('a plate without holes is drawn with its size only', () => {
  const design = replayDesign(withPlate(railHistory(), 'part-1', { widthMm: 300, depthMm: 200 }));
  const plate = ofKind(design.resolved.get('part-2')?.part, 'plate');
  const svg = plateDrawingSvg(plate, []);
  assert.doesNotMatch(svg, /<circle/);
  assert.deepEqual(texts(svg).slice(0, 2), ['300', '200']);
});

test('fastening holes are drawn and named after the profile they bolt the plate to', () => {
  const history = fastenWithBolts(referenceDesign(), 'part-2@part-1', 1);
  const { svg, holes, plate } = drawingOf(history);
  const bolt = present(
    holes.find((hole) => hole.kind === 'fastening'),
    'a fastening hole',
  );
  assert.match(holeDescription(plate, bolt), /^Bolt 1 to Rail: fastening hole ⌀9 mm, 100 mm from/);
  assert.match(svg, /data-kind="fastening"/);
});

test('a name typed by the user is escaped in the drawing', () => {
  const history = withPlate(railHistory(), 'part-1', { name: 'Plate A & B' });
  const design = replayDesign(history);
  const svg = plateDrawingSvg(ofKind(design.resolved.get('part-2')?.part, 'plate'), []);
  assert.ok(svg.includes('Plate A &amp; B ·'));
});

test('a slot is drawn as two straight sides and two half circles, centered where its hole would be', () => {
  let history = referenceDesign();
  history = addAdjustment(history, 'part-3');
  history = editAdjustment(history, 'part-3', { travelMm: 60 });
  const { svg, holes, plate } = drawingOf(history);
  assert.doesNotMatch(svg, /<circle/);
  const outlines = [...svg.matchAll(/<path class="slot-outline" d="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(outlines.length, 4);
  // The first hole, 60 mm right of the center and 40 mm below it, slides up and down the page,
  // 66.5 mm end to end: straight from 10 to 70 down the SVG, half circles at both ends.
  assert.equal(
    outlines[0],
    'M 56.75 10 L 56.75 70 A 3.25 3.25 0 0 0 63.25 70 L 63.25 10 A 3.25 3.25 0 0 0 56.75 10 Z',
  );
  assert.equal(
    holeDescription(plate, present(holes[0], 'the first slot')),
    'Wheel base, hole 1: mounting slot 6.5 mm wide and 66.5 mm long, centered 160 mm from the left edge and 35 mm from the bottom edge',
  );
});
