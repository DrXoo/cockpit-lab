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
import {
  railHistory,
  REFERENCE_PATTERN,
  referenceWheelBase,
  withPeripheral,
  withPlate,
} from '../../../support/designs.ts';
import { ofKind, present } from '../../../support/lookups.ts';

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
  const { svg } = drawingOf(referenceWheelBase());
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /<rect [^>]*x="-100" y="-75" width="200" height="150"/);
});

test('each hole is a circle where the plate puts it, up the page as the drawing goes up', () => {
  const { svg, holes } = drawingOf(referenceWheelBase());
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
  const { svg, holes, plate } = drawingOf(referenceWheelBase());
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
  const shown = texts(drawingOf(referenceWheelBase()).svg);
  for (const expected of ['200', '150', '40', '160', '35', '115'])
    assert.ok(shown.includes(expected), `${expected} in ${shown.join(', ')}`);
  assert.equal(shown.filter((text) => text === '40').length, 1);
});

test('an arrow says which way up the page is on the cockpit, and the side it is seen from', () => {
  const shown = texts(drawingOf(referenceWheelBase()).svg);
  assert.ok(shown.includes('↑ front'), shown.join(', '));
  assert.ok(
    shown.includes(
      'Reference plate · 200 × 150 mm · Aluminium sheet, 5 mm · Laser or water-jet cutting · seen from above',
    ),
    shown.join(', '),
  );
  const below = texts(drawingOf(referenceWheelBase('-y')).svg);
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
  const history = fastenWithBolts(referenceWheelBase(), 'part-2@part-1', 1);
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
  let history = referenceWheelBase();
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

test('a hole with a problem is marked ⚠ in the drawing, and its description says what it is', async () => {
  const { plateHoleProblems, problemsOfHole } =
    await import('../../../../src/cockpit/cad/analysis/hole-problems.ts');
  const crossing = { holes: [{ xMm: 97, yMm: 0, diameterMm: 8 }, ...REFERENCE_PATTERN.holes] };
  const history = withPeripheral(referenceWheelBase().slice(0, 2), 'part-2', 'generic-wheel-base', {
    name: 'Wheel base',
    mountingPattern: crossing,
  });
  const design = replayDesign(history);
  const plate = ofKind(design.resolved.get('part-2')?.part, 'plate');
  const holes = holesOfPlate(design, 'part-2');
  const problems = plateHoleProblems(design, 'part-2');
  const svg = plateDrawingSvg(plate, holes, problems);
  assert.match(svg, /<g class="plate-hole has-problem" data-hole="0"/);
  assert.match(svg, /<g class="plate-hole" data-hole="1"/);
  assert.equal(texts(svg).filter((shown) => shown === '⚠').length, 1);
  const described = holeDescription(
    plate,
    present(holes[0], 'hole 1'),
    problemsOfHole(problems, 0),
  );
  assert.match(
    described,
    /^Wheel base, hole 1: mounting hole ⌀8 mm, .* · ⚠ Wheel base, hole 1 crosses the edge$/,
  );
});

test('a 100 mm scale bar under the drawing checks a print against the plate', () => {
  const { svg } = drawingOf(referenceWheelBase());
  const bar = present(/<g class="scale-bar">(.*?)<\/g>/.exec(svg)?.[1], 'the scale bar');
  const [x1, , x2] = present(
    /<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)"/.exec(bar)?.slice(1).map(Number),
    'the line of the scale bar',
  );
  assert.equal(Math.abs(present(x2, 'its end') - present(x1, 'its start')), 100);
  assert.ok(texts(bar).includes('100 mm'), texts(bar).join(', '));
});

test('the template to print sets its text at 3.5 mm, and its size in mm is that of its view box', () => {
  const { plate, holes } = drawingOf(referenceWheelBase());
  const svg = plateDrawingSvg(plate, holes, [], { forPrint: true });
  const sizes = new Set([...svg.matchAll(/font-size="([\d.]+)"/g)].map((match) => match[1]));
  assert.deepEqual([...sizes], ['3.5']);
  const [, , viewWidth, viewHeight] = present(
    /viewBox="([^"]+)"/.exec(svg)?.[1]?.split(' '),
    'the view box',
  );
  assert.match(svg, new RegExp(`width="${viewWidth}mm" height="${viewHeight}mm"`));
});
