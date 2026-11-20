// What is wrong with the holes of a plate for how it is made: a hole off or across its outline,
// too close to its edge or to another hole for its fabrication process, a slot the process
// cannot cut, and a mounting hole over a profile the plate rests on, where its bolt has no room
// for a nut unless it goes into the profile's slot. They are warnings: nothing refuses an edit.
// A geometric check of the approximate model, in mm on the plate's drawing.
import { round } from '../../../shared/geometry.ts';
import { faceAxis, type Axis, type ResolvedPart } from '../parts/assembly.ts';
import { sheetType } from '../parts/catalog.ts';
import { slotCentersAcross } from '../parts/connectors.ts';
import {
  fabricationProcess,
  leastEdgeMarginMm,
  leastGapBetweenHolesMm,
  type FabricationProcess,
} from '../parts/fabrication.ts';
import {
  drawnOnPlate,
  holesOfPlate,
  plateView,
  type DrawnOn,
  type PlateHole,
  type PlateHoleSources,
} from '../parts/plate-holes.ts';

export type HoleProblemKind =
  'off-plate' | 'near-edge' | 'near-hole' | 'uncut-slot' | 'over-profile';

export interface HoleProblem {
  kind: HoleProblemKind;
  /** The holes it is about, by their place in the plate's holes. */
  holeIndexes: number[];
  /** What is wrong, naming the holes after what puts them there. */
  text: string;
}

const AXES: readonly Axis[] = ['x', 'y', 'z'];

/** Differences below this many mm are noise from replaying the design, not a problem. */
const MEASURE_TOLERANCE_MM = 0.01;

/**
 * How far a bolt's hole may lie from a slot's center line and still take a T-nut in it:
 * estimated, as the bolt has about that much play in its hole and in the slot's opening.
 */
const SLOT_ALIGNMENT_MM = 1;

/** Every problem of a plate's holes: each hole's own first, in order, then those of pairs. */
export function plateHoleProblems(design: PlateHoleSources, plateId: string): HoleProblem[] {
  const plate = design.resolved.get(plateId);
  if (plate?.part.kind !== 'plate') throw new Error(`Part ${plateId} is not a plate.`);
  const holes = holesOfPlate(design, plateId);
  const process = fabricationProcess(plate.part.processId);
  const thicknessMm = sheetType(plate.part.sheetId).thicknessMm;
  const outline = { halfWidthMm: plate.part.widthMm / 2, halfDepthMm: plate.part.depthMm / 2 };
  const profiles = profilesUnder(design, plate);
  const own = holes.flatMap((hole, index) => [
    ...outlineProblems(hole, index, outline, process, thicknessMm),
    ...slotProblems(hole, index, process),
    ...profileProblems(hole, index, profiles),
  ]);
  return [...own, ...pairProblems(holes, process, thicknessMm)];
}

/** A hole as the shape it cuts: a segment, a point for a round hole, swept by its radius. */
interface Stadium {
  from: Point;
  to: Point;
  radiusMm: number;
}

interface Point {
  xMm: number;
  yMm: number;
}

interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function stadiumOf(hole: PlateHole): Stadium {
  const halfMm = hole.slot ? (hole.slot.lengthMm - hole.diameterMm) / 2 : 0;
  const alongX = hole.slot?.along === 'x';
  const dx = alongX ? halfMm : 0;
  const dy = alongX ? 0 : halfMm;
  return {
    from: { xMm: hole.xMm - dx, yMm: hole.yMm - dy },
    to: { xMm: hole.xMm + dx, yMm: hole.yMm + dy },
    radiusMm: hole.diameterMm / 2,
  };
}

function extentOf({ from, to, radiusMm }: Stadium): Extent {
  return {
    minX: Math.min(from.xMm, to.xMm) - radiusMm,
    maxX: Math.max(from.xMm, to.xMm) + radiusMm,
    minY: Math.min(from.yMm, to.yMm) - radiusMm,
    maxY: Math.max(from.yMm, to.yMm) + radiusMm,
  };
}

const overlaps = (a: Extent, b: Extent): boolean =>
  a.minX < b.maxX - MEASURE_TOLERANCE_MM &&
  b.minX < a.maxX - MEASURE_TOLERANCE_MM &&
  a.minY < b.maxY - MEASURE_TOLERANCE_MM &&
  b.minY < a.maxY - MEASURE_TOLERANCE_MM;

const processText = (process: FabricationProcess): string =>
  process.name.charAt(0).toLowerCase() + process.name.slice(1);

/** A hole off the plate or across its edge; otherwise, one too close to it for the process. */
function outlineProblems(
  hole: PlateHole,
  index: number,
  outline: { halfWidthMm: number; halfDepthMm: number },
  process: FabricationProcess,
  thicknessMm: number,
): HoleProblem[] {
  const extent = extentOf(stadiumOf(hole));
  const { halfWidthMm, halfDepthMm } = outline;
  const plate = { minX: -halfWidthMm, maxX: halfWidthMm, minY: -halfDepthMm, maxY: halfDepthMm };
  if (!overlaps(extent, plate))
    return [{ kind: 'off-plate', holeIndexes: [index], text: `${hole.source} lies off the plate` }];
  const toEdgeMm = Math.min(
    extent.minX - plate.minX,
    plate.maxX - extent.maxX,
    extent.minY - plate.minY,
    plate.maxY - extent.maxY,
  );
  if (toEdgeMm < -MEASURE_TOLERANCE_MM)
    return [{ kind: 'off-plate', holeIndexes: [index], text: `${hole.source} crosses the edge` }];
  const wantedMm = leastEdgeMarginMm(process, { thicknessMm, diameterMm: hole.diameterMm });
  if (toEdgeMm >= wantedMm - MEASURE_TOLERANCE_MM) return [];
  return [
    {
      kind: 'near-edge',
      holeIndexes: [index],
      text: `${hole.source} is ${round(toEdgeMm, 1)} mm from the edge; ${processText(process)} wants ${round(wantedMm, 1)} mm`,
    },
  ];
}

function slotProblems(hole: PlateHole, index: number, process: FabricationProcess): HoleProblem[] {
  if (hole.slot === undefined || process.cutsSlots) return [];
  return [
    {
      kind: 'uncut-slot',
      holeIndexes: [index],
      text: `${hole.source} is a slot, which ${processText(process)} cannot cut`,
    },
  ];
}

/** Two holes that overlap, or leave less material between them than the process wants. */
function pairProblems(
  holes: readonly PlateHole[],
  process: FabricationProcess,
  thicknessMm: number,
): HoleProblem[] {
  const problems: HoleProblem[] = [];
  holes.forEach((first, firstIndex) => {
    holes.slice(firstIndex + 1).forEach((second, offset) => {
      const secondIndex = firstIndex + 1 + offset;
      const gapMm = gapBetween(stadiumOf(first), stadiumOf(second));
      const diameterMm = Math.max(first.diameterMm, second.diameterMm);
      const wantedMm = leastGapBetweenHolesMm(process, { thicknessMm, diameterMm });
      if (gapMm >= wantedMm - MEASURE_TOLERANCE_MM) return;
      const both = `${first.source} and ${second.source}`;
      const text =
        gapMm < MEASURE_TOLERANCE_MM
          ? `${both} overlap by ${round(-gapMm, 1)} mm`
          : `${both} are ${round(gapMm, 1)} mm apart; ${processText(process)} wants ${round(wantedMm, 1)} mm`;
      problems.push({ kind: 'near-hole', holeIndexes: [firstIndex, secondIndex], text });
    });
  });
  return problems;
}

/** The material between two holes; less than zero where they overlap. */
const gapBetween = (a: Stadium, b: Stadium): number =>
  segmentDistance(a.from, a.to, b.from, b.to) - a.radiusMm - b.radiusMm;

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

const cross = (o: Point, a: Point, b: Point): number =>
  (a.xMm - o.xMm) * (b.yMm - o.yMm) - (a.yMm - o.yMm) * (b.xMm - o.xMm);

/** Whether two segments cross each other, each passing between the other's ends. */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function pointToSegment(point: Point, from: Point, to: Point): number {
  const dx = to.xMm - from.xMm;
  const dy = to.yMm - from.yMm;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((point.xMm - from.xMm) * dx + (point.yMm - from.yMm) * dy) / lengthSquared),
        );
  return Math.hypot(point.xMm - (from.xMm + along * dx), point.yMm - (from.yMm + along * dy));
}

/** A profile under the plate as its drawing has it: where it lies and its slots' center lines. */
interface ProfileUnder {
  name: string;
  footprint: Extent;
  /** The way its slots run on the drawing, and where each center line is across that. */
  slotsAlong: 'x' | 'y';
  slotLinesMm: number[];
}

/** The profiles the plate is joined to, as its drawing has them. */
function profilesUnder(design: PlateHoleSources, plate: ResolvedPart): ProfileUnder[] {
  const onPlate = drawnOnPlate(plate);
  const normal = plate.part.kind === 'plate' ? faceAxis(plate.part.normal) : 'y';
  const right = plate.part.kind === 'plate' ? faceAxis(plateView(plate.part).right) : 'x';
  const under: ProfileUnder[] = [];
  for (const joint of design.joints) {
    if (joint.partId !== plate.part.id) continue;
    const profile = design.resolved.get(joint.toPartId);
    if (profile?.part.kind !== 'profile' || profile.part.axis === normal) continue;
    under.push(profileUnder(profile, profile.part.axis, normal, right, onPlate));
  }
  return under;
}

function profileUnder(
  profile: ResolvedPart,
  along: Axis,
  normal: Axis,
  right: Axis,
  onPlate: DrawnOn,
): ProfileUnder {
  const corners = [onPlate(profile.box.min), onPlate(profile.box.max)];
  const footprint = {
    minX: Math.min(...corners.map((corner) => corner.xMm)),
    maxX: Math.max(...corners.map((corner) => corner.xMm)),
    minY: Math.min(...corners.map((corner) => corner.yMm)),
    maxY: Math.max(...corners.map((corner) => corner.yMm)),
  };
  const across = AXES.find((axis) => axis !== along && axis !== normal) ?? 'x';
  const slotsAlong = across === right ? 'y' : 'x';
  const slotLinesMm = slotCentersAcross(profile, across).map((centerMm) => {
    const point = { ...profile.box.min, [across]: centerMm };
    const drawn = onPlate(point);
    return slotsAlong === 'y' ? drawn.xMm : drawn.yMm;
  });
  return { name: profile.part.name, footprint, slotsAlong, slotLinesMm };
}

/**
 * A mounting hole over a profile the plate rests on, unless it lies along one of the profile's
 * slots, where its bolt takes a T-nut. A bolt that fastens the plate is always in a slot.
 */
function profileProblems(
  hole: PlateHole,
  index: number,
  profiles: readonly ProfileUnder[],
): HoleProblem[] {
  if (hole.kind !== 'mounting') return [];
  const stadium = stadiumOf(hole);
  const extent = extentOf(stadium);
  return profiles
    .filter((profile) => overlaps(extent, profile.footprint) && !inASlot(stadium, profile))
    .map((profile): HoleProblem => ({
      kind: 'over-profile',
      holeIndexes: [index],
      text: `${hole.source} is over ${profile.name} but off its slot: its bolt has no room for a nut`,
    }));
}

/** Whether a hole lies wholly along one of the profile's slots, its ends on the center line. */
function inASlot({ from, to }: Stadium, profile: ProfileUnder): boolean {
  const offsets = profile.slotsAlong === 'y' ? [from.xMm, to.xMm] : [from.yMm, to.yMm];
  return profile.slotLinesMm.some((lineMm) =>
    offsets.every((offsetMm) => Math.abs(offsetMm - lineMm) <= SLOT_ALIGNMENT_MM),
  );
}
