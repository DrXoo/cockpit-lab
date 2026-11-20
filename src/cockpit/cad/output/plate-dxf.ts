// The DXF of a plate for a cutting shop: AutoCAD R12 ASCII, in mm, as the plate's drawing sees it
// (plate-holes.ts) with the origin at its bottom left corner, so the coordinates are the drawing's
// dimensions. The outline is a closed polyline, each hole a circle and each slot a closed polyline
// of two straight sides and two half circles. Holes that coincide are written once, and there is
// no text or dimension a shop might cut.
import type { PlatePart } from '../parts/assembly.ts';
import type { PlateHole } from '../parts/plate-holes.ts';

/** AutoCAD Release 12, the DXF version every cutting program reads. */
const R12_VERSION = 'AC1009';
/** The layer every entity is on: the one each DXF has. */
const LAYER = '0';
/** Bit 1 of a polyline's flags (group code 70): it closes back to its first vertex. */
const CLOSED_POLYLINE = 1;
/** The bulge of a vertex whose segment to the next is a half circle turning anticlockwise. */
const HALF_CIRCLE_BULGE = 1;

interface Vertex {
  xMm: number;
  yMm: number;
  bulge: number;
}

/** The DXF of a plate with its holes, as the text of the file. */
export function plateDxf(plate: PlatePart, holes: readonly PlateHole[]): string {
  const toCorner = (hole: PlateHole): PlateHole => ({
    ...hole,
    xMm: hole.xMm + plate.widthMm / 2,
    yMm: hole.yMm + plate.depthMm / 2,
  });
  const entities = [
    polyline(outlineVertices(plate)),
    ...distinctHoles(holes.map(toCorner)).map(holeEntity),
  ];
  const pairs = [
    ...section('HEADER', [
      [9, '$ACADVER'],
      [1, R12_VERSION],
    ]),
    ...section('ENTITIES', entities.flat()),
    [0, 'EOF'] as const,
  ];
  return pairs.map(([code, value]) => `${String(code).padStart(3)}\n${value}\n`).join('');
}

type Pair = readonly [code: number, value: string];

function section(name: string, body: readonly Pair[]): Pair[] {
  return [[0, 'SECTION'], [2, name], ...body, [0, 'ENDSEC']];
}

function outlineVertices(plate: PlatePart): Vertex[] {
  return [
    { xMm: 0, yMm: 0, bulge: 0 },
    { xMm: plate.widthMm, yMm: 0, bulge: 0 },
    { xMm: plate.widthMm, yMm: plate.depthMm, bulge: 0 },
    { xMm: 0, yMm: plate.depthMm, bulge: 0 },
  ];
}

/** The holes once each: a shop's machine would cut a repeated one twice. */
function distinctHoles(holes: readonly PlateHole[]): PlateHole[] {
  const byShape = new Map<string, PlateHole>();
  for (const hole of holes) {
    const slot = hole.slot ? `${hole.slot.along} ${number(hole.slot.lengthMm)}` : 'round';
    const key = `${number(hole.xMm)} ${number(hole.yMm)} ${number(hole.diameterMm)} ${slot}`;
    if (!byShape.has(key)) byShape.set(key, hole);
  }
  return [...byShape.values()];
}

function holeEntity(hole: PlateHole): Pair[] {
  if (hole.slot) return polyline(slotVertices(hole, hole.slot));
  return [
    [0, 'CIRCLE'],
    [8, LAYER],
    ...point(hole.xMm, hole.yMm),
    [40, number(hole.diameterMm / 2)],
  ];
}

/**
 * A slot centered where its hole is, turning anticlockwise: a straight side, a half circle
 * round one end, the other side and a half circle round the other end.
 */
function slotVertices(hole: PlateHole, slot: NonNullable<PlateHole['slot']>): Vertex[] {
  const radiusMm = hole.diameterMm / 2;
  const halfStraightMm = slot.lengthMm / 2 - radiusMm;
  const { xMm, yMm } = hole;
  const side = (alongMm: number, acrossMm: number, bulge: number): Vertex =>
    slot.along === 'x'
      ? { xMm: xMm + alongMm, yMm: yMm + acrossMm, bulge }
      : { xMm: xMm - acrossMm, yMm: yMm + alongMm, bulge };
  return [
    side(-halfStraightMm, -radiusMm, 0),
    side(halfStraightMm, -radiusMm, HALF_CIRCLE_BULGE),
    side(halfStraightMm, radiusMm, 0),
    side(-halfStraightMm, radiusMm, HALF_CIRCLE_BULGE),
  ];
}

function polyline(vertices: readonly Vertex[]): Pair[] {
  const header: Pair[] = [
    [0, 'POLYLINE'],
    [8, LAYER],
    // Vertices follow, up to the SEQEND.
    [66, '1'],
    ...point(0, 0),
    [70, String(CLOSED_POLYLINE)],
  ];
  const body = vertices.flatMap((vertex): Pair[] => [
    [0, 'VERTEX'],
    [8, LAYER],
    ...point(vertex.xMm, vertex.yMm),
    ...(vertex.bulge === 0 ? [] : [[42, number(vertex.bulge)] as const]),
  ]);
  return [...header, ...body, [0, 'SEQEND'], [8, LAYER]];
}

function point(xMm: number, yMm: number): Pair[] {
  return [
    [10, number(xMm)],
    [20, number(yMm)],
    [30, '0'],
  ];
}

/** A coordinate of the DXF, to a thousandth of a mm. */
const number = (valueMm: number): string => String(Math.round(valueMm * 1000) / 1000 || 0);
