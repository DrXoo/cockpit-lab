// The drawing of a plate: its outline and holes at 1:1 in mm, seen from its face away from the
// profile with its depth up the page (plate-holes.ts), with its size, the position of each row
// and column of holes from the bottom left corner, and an arrow saying which way up the page is
// on the cockpit, and a ⚠ beside each hole with a problem (hole-problems.ts). The editor shows it and the plate's exports start from it. Its lines and text
// take the color of the page around it (currentColor).
import { problemsOfHole, type HoleProblem } from '../analysis/hole-problems.ts';
import type { Face, PlatePart } from '../parts/assembly.ts';
import { sheetType } from '../parts/catalog.ts';
import { plateView, type PlateHole, type PlateHoleKind } from '../parts/plate-holes.ts';

/** Text as tall as this share of the plate's longer side, within the sizes below, in mm. */
const TEXT_SHARE_OF_PLATE = 1 / 30;
const MIN_TEXT_MM = 4;
const MAX_TEXT_MM = 12;
/** A rough width of a character of the drawing's text, as a share of its height. */
const CHARACTER_WIDTH_SHARE = 0.6;
/** The longest dimension a margin makes room for, in characters: "1234.5". */
const LONGEST_DIMENSION_CHARACTERS = 6;

/** Which way + on an axis is on the cockpit, as the driver names it. */
const UP_NAMES: Record<Face, string> = {
  '+x': 'left',
  '-x': 'right',
  '+y': 'up',
  '-y': 'down',
  '+z': 'front',
  '-z': 'back',
};
const SEEN_FROM_NAMES: Record<Face, string> = {
  '+x': 'the left',
  '-x': 'the right',
  '+y': 'above',
  '-y': 'below',
  '+z': 'the front',
  '-z': 'the back',
};
const KIND_NAMES: Record<PlateHoleKind, string> = {
  mounting: 'mounting hole',
  fastening: 'fastening hole',
};
const SLOT_NAMES: Record<PlateHoleKind, string> = {
  mounting: 'mounting slot',
  fastening: 'fastening slot',
};

/** What the drawing says about a hole when it is pointed at, with what is wrong with it. */
export function holeDescription(
  plate: PlatePart,
  hole: PlateHole,
  problems: readonly HoleProblem[] = [],
): string {
  const warnings = problems.map((problem) => ` · ⚠ ${problem.text}`).join('');
  return `${holeWhereText(plate, hole)}${warnings}`;
}

function holeWhereText(plate: PlatePart, hole: PlateHole): string {
  const fromLeft = lengthText(hole.xMm + plate.widthMm / 2);
  const fromBottom = lengthText(hole.yMm + plate.depthMm / 2);
  const where = `${fromLeft} mm from the left edge and ${fromBottom} mm from the bottom edge`;
  const diameter = lengthText(hole.diameterMm);
  if (hole.slot)
    return `${hole.source}: ${SLOT_NAMES[hole.kind]} ${diameter} mm wide and ${lengthText(hole.slot.lengthMm)} mm long, centered ${where}`;
  return `${hole.source}: ${KIND_NAMES[hole.kind]} ⌀${diameter} mm, ${where}`;
}

/** The drawing of a plate with its holes and their problems, as an SVG document in mm. */
export function plateDrawingSvg(
  plate: PlatePart,
  holes: readonly PlateHole[],
  problems: readonly HoleProblem[] = [],
): string {
  const layout = layoutOf(plate);
  const caption = captionOf(plate);
  const { textMm } = layout;
  const left = -plate.widthMm / 2 - layout.leftMarginMm;
  const top = -plate.depthMm / 2 - layout.topMarginMm;
  const contentWidthMm = layout.leftMarginMm + plate.widthMm + layout.rightMarginMm;
  const captionWidthMm = caption.length * CHARACTER_WIDTH_SHARE * textMm + textMm;
  const widthMm = Math.max(contentWidthMm, captionWidthMm);
  const heightMm = layout.topMarginMm + plate.depthMm + layout.bottomMarginMm;
  const parts = [
    outline(plate, layout),
    sizeDimensions(plate, layout),
    holeColumns(plate, holes, layout),
    holeRows(plate, holes, layout),
    ...holes.map((hole, index) =>
      holeShape(plate, hole, index, problemsOfHole(problems, index), layout),
    ),
    orientation(plate, layout, left),
    text(
      caption,
      left + textMm / 2,
      plate.depthMm / 2 + layout.bottomMarginMm - textMm / 2,
      layout,
      {
        className: 'plate-caption',
      },
    ),
  ];
  const viewBox = [left, top, widthMm, heightMm].map(number).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="plate-drawing" viewBox="${viewBox}" width="${number(widthMm)}mm" height="${number(heightMm)}mm" font-family="sans-serif" font-size="${number(textMm)}" fill="none" stroke="currentColor" stroke-width="${number(textMm / 12)}">${parts.join('')}</svg>`;
}

/** Sizes of the drawing's text and margins, in mm, all following the plate's size. */
interface Layout {
  textMm: number;
  leftMarginMm: number;
  rightMarginMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
}

function layoutOf(plate: PlatePart): Layout {
  const longerSideMm = Math.max(plate.widthMm, plate.depthMm);
  const textMm = Math.min(Math.max(longerSideMm * TEXT_SHARE_OF_PLATE, MIN_TEXT_MM), MAX_TEXT_MM);
  const dimensionMm = LONGEST_DIMENSION_CHARACTERS * CHARACTER_WIDTH_SHARE * textMm;
  return {
    textMm,
    leftMarginMm: 2 * textMm + dimensionMm,
    rightMarginMm: 4 * textMm,
    topMarginMm: 4 * textMm,
    bottomMarginMm: 2 * textMm + dimensionMm + 2 * textMm,
  };
}

function captionOf(plate: PlatePart): string {
  const sheet = sheetType(plate.sheetId).name;
  const seenFrom = SEEN_FROM_NAMES[plateView(plate).seenFrom];
  return `${plate.name} · ${lengthText(plate.widthMm)} × ${lengthText(plate.depthMm)} mm · ${sheet} · seen from ${seenFrom}`;
}

function outline(plate: PlatePart, { textMm }: Layout): string {
  const x = number(-plate.widthMm / 2);
  const y = number(-plate.depthMm / 2);
  return `<rect class="plate-outline" x="${x}" y="${y}" width="${number(plate.widthMm)}" height="${number(plate.depthMm)}" stroke-width="${number(textMm / 6)}"/>`;
}

/** The plate's width above it and its depth to its right, each between two extension lines. */
function sizeDimensions(plate: PlatePart, layout: Layout): string {
  const { textMm } = layout;
  const halfWidth = plate.widthMm / 2;
  const halfDepth = plate.depthMm / 2;
  const widthLineY = -halfDepth - 2 * textMm;
  const depthLineX = halfWidth + 2 * textMm;
  const lines = [
    line(-halfWidth, -halfDepth - textMm / 2, -halfWidth, widthLineY - textMm / 2),
    line(halfWidth, -halfDepth - textMm / 2, halfWidth, widthLineY - textMm / 2),
    line(-halfWidth, widthLineY, halfWidth, widthLineY),
    line(halfWidth + textMm / 2, -halfDepth, depthLineX + textMm / 2, -halfDepth),
    line(halfWidth + textMm / 2, halfDepth, depthLineX + textMm / 2, halfDepth),
    line(depthLineX, -halfDepth, depthLineX, halfDepth),
  ];
  const widthText = text(lengthText(plate.widthMm), 0, widthLineY - textMm / 3, layout, {
    anchor: 'middle',
  });
  const depthText = text(lengthText(plate.depthMm), depthLineX - textMm / 3, 0, layout, {
    anchor: 'middle',
    turned: true,
  });
  return `<g class="plate-dimensions">${lines.join('')}${widthText}${depthText}</g>`;
}

/** Below the plate, how far each column of holes is from its left edge. */
function holeColumns(plate: PlatePart, holes: readonly PlateHole[], layout: Layout): string {
  const { textMm } = layout;
  const bottom = plate.depthMm / 2;
  const marks = distinct(holes.map((hole) => hole.xMm)).map((xMm) => {
    const tick = line(xMm, bottom + textMm / 2, xMm, bottom + 1.5 * textMm);
    const value = lengthText(xMm + plate.widthMm / 2);
    return `${tick}${text(value, xMm + textMm / 3, bottom + 2 * textMm, layout, { anchor: 'end', turned: true })}`;
  });
  return `<g class="hole-columns">${marks.join('')}</g>`;
}

/** Left of the plate, how far each row of holes is from its bottom edge. */
function holeRows(plate: PlatePart, holes: readonly PlateHole[], layout: Layout): string {
  const { textMm } = layout;
  const left = -plate.widthMm / 2;
  const marks = distinct(holes.map((hole) => hole.yMm)).map((yMm) => {
    const tick = line(left - textMm / 2, -yMm, left - 1.5 * textMm, -yMm);
    const value = lengthText(yMm + plate.depthMm / 2);
    return `${tick}${text(value, left - 2 * textMm, -yMm + textMm / 3, layout, { anchor: 'end' })}`;
  });
  return `<g class="hole-rows">${marks.join('')}</g>`;
}

function holeShape(
  plate: PlatePart,
  hole: PlateHole,
  index: number,
  problems: readonly HoleProblem[],
  layout: Layout,
): string {
  const { textMm } = layout;
  const x = hole.xMm;
  const y = -hole.yMm;
  const radiusMm = hole.diameterMm / 2;
  const markMm = radiusMm + textMm / 2;
  const centerMark = `${line(x - markMm, y, x + markMm, y)}${line(x, y - markMm, x, y + markMm)}`;
  const title = `<title>${escaped(holeDescription(plate, hole, problems))}</title>`;
  const shape = hole.slot
    ? `<path class="slot-outline" d="${slotPath(x, y, radiusMm, hole.slot)}"/>`
    : `<circle cx="${number(x)}" cy="${number(y)}" r="${number(radiusMm)}"/>`;
  const className = problems.length ? 'plate-hole has-problem' : 'plate-hole';
  // Above the right of the hole, clear of its center mark.
  const warning = problems.length
    ? text('⚠', x + markMm, y - markMm, layout, { className: 'hole-warning' })
    : '';
  return `<g class="${className}" data-hole="${index}" data-kind="${hole.kind}">${title}${shape}<g class="center-mark" stroke-width="${number(textMm / 20)}">${centerMark}</g>${warning}</g>`;
}

/**
 * The outline of a slot centered on `x`, `y` of the SVG: its two straight sides and a half
 * circle at each end, drawn in one turn.
 */
function slotPath(
  x: number,
  y: number,
  radiusMm: number,
  slot: NonNullable<PlateHole['slot']>,
): string {
  const halfStraightMm = (slot.lengthMm - 2 * radiusMm) / 2;
  const arc = (toX: number, toY: number) =>
    `A ${number(radiusMm)} ${number(radiusMm)} 0 0 0 ${number(toX)} ${number(toY)}`;
  const at = (pointX: number, pointY: number) => `${number(pointX)} ${number(pointY)}`;
  if (slot.along === 'y') {
    const [left, right] = [x - radiusMm, x + radiusMm];
    const [top, bottom] = [y - halfStraightMm, y + halfStraightMm];
    return `M ${at(left, top)} L ${at(left, bottom)} ${arc(right, bottom)} L ${at(right, top)} ${arc(left, top)} Z`;
  }
  const [left, right] = [x - halfStraightMm, x + halfStraightMm];
  const [top, bottom] = [y - radiusMm, y + radiusMm];
  return `M ${at(left, bottom)} L ${at(right, bottom)} ${arc(right, top)} L ${at(left, top)} ${arc(left, bottom)} Z`;
}

/** In the top left corner, which way up the page is on the cockpit: "↑ front". */
function orientation(plate: PlatePart, layout: Layout, left: number): string {
  const up = UP_NAMES[plateView(plate).up];
  const y = -plate.depthMm / 2 - 2 * layout.textMm;
  return text(`↑ ${up}`, left + layout.textMm / 2, y, layout, { className: 'plate-orientation' });
}

interface TextOptions {
  anchor?: 'start' | 'middle' | 'end';
  /** Read from the bottom up, as a dimension along the page's height. */
  turned?: boolean;
  className?: string;
}

function text(
  value: string,
  x: number,
  y: number,
  { textMm }: Layout,
  { anchor = 'start', turned = false, className }: TextOptions = {},
): string {
  const at = `x="${number(x)}" y="${number(y)}"`;
  const turn = turned ? ` transform="rotate(-90 ${number(x)} ${number(y)})"` : '';
  const named = className ? ` class="${className}"` : '';
  return `<text${named} ${at}${turn} text-anchor="${anchor}" fill="currentColor" stroke="none" font-size="${number(textMm)}">${escaped(value)}</text>`;
}

const line = (x1: number, y1: number, x2: number, y2: number): string =>
  `<line x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}"/>`;

/** The values once each, as the drawing shows them, in order. */
function distinct(valuesMm: readonly number[]): number[] {
  const seen = new Map<string, number>();
  for (const valueMm of valuesMm) {
    const shown = lengthText(valueMm);
    if (!seen.has(shown)) seen.set(shown, valueMm);
  }
  return [...seen.values()].sort((a, b) => a - b);
}

/** A length as the drawing writes it: to a tenth of a mm, without a trailing .0. */
const lengthText = (lengthMm: number): string => String(Math.round(lengthMm * 10) / 10 || 0);

/** A coordinate of the SVG, to a thousandth of a mm. */
const number = (valueMm: number): string => String(Math.round(valueMm * 1000) / 1000 || 0);

const escaped = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
