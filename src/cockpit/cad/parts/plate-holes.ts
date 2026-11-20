// The holes of a plate, each put there by something else (docs/adr/0006): a mounting hole for each
// hole of the mounting pattern of a peripheral mounted on it, and a fastening hole for each bolt
// that fastens it to a profile. They are worked out from the design with its parts at the center
// of their travel, as fitting never moves them.
//
// A plate is drawn seen from its face away from the profile it rests on, its depth up the page
// towards + on its axis. Plate coordinates are in mm from its center as drawn: X to the right of
// the page and Y up it.
import {
  crossFace,
  faceAxis,
  peripheralPointInFrame,
  type Face,
  type PlatePart,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import { isPlateBolt, plateBoltType } from './catalog.ts';
import type { PlacedConnector } from './connectors.ts';
import type { Joint } from './joints.ts';

/** What puts a hole in a plate: a peripheral mounted on it, or a bolt fastening it. */
export type PlateHoleKind = 'mounting' | 'fastening';

export interface PlateHole {
  kind: PlateHoleKind;
  /** To the right of the plate's center, as it is drawn. */
  xMm: number;
  /** Up from the plate's center, as it is drawn. */
  yMm: number;
  diameterMm: number;
  /** What puts it there, as the drawing names it: "Bucket seat, hole 2". */
  source: string;
}

/** The ways a plate's drawing looks along, as faces of the frame of its tilt. */
export interface PlateView {
  /** To the right of the page. */
  right: Face;
  /** Up the page: + on the plate's depth axis. */
  up: Face;
  /** The face it is seen from, away from the profile it rests on. */
  seenFrom: Face;
}

/** What the holes of a plate come from: a replayed design, with its parts at the center of their travel. */
export interface PlateHoleSources {
  resolved: ReadonlyMap<string, ResolvedPart>;
  joints: readonly Joint[];
  connectors: readonly PlacedConnector[];
}

export function plateView(plate: PlatePart): PlateView {
  const up: Face = `+${plate.depthAxis}`;
  // Seen from outside the face, the page's right crossed with its up points at the viewer.
  return { right: crossFace(up, plate.normal), up, seenFrom: plate.normal };
}

/** Every hole of a plate: the mounting holes of each peripheral on it, then its fastening holes. */
export function holesOfPlate(design: PlateHoleSources, plateId: string): PlateHole[] {
  const plate = design.resolved.get(plateId);
  if (plate?.part.kind !== 'plate') throw new Error(`Part ${plateId} is not a plate.`);
  const onPlate = drawnOn(plate, plate.part);
  return [...mountingHoles(design, plateId, onPlate), ...fasteningHoles(design, plateId, onPlate)];
}

/** The holes of every plate in a design, by the plate's id. */
export function holesOfPlates(design: PlateHoleSources): Map<string, PlateHole[]> {
  const holes = new Map<string, PlateHole[]>();
  for (const { part } of design.resolved.values())
    if (part.kind === 'plate') holes.set(part.id, holesOfPlate(design, part.id));
  return holes;
}

/**
 * The point of a plate at `xMm`, `yMm` as drawn, halfway through its thickness, in the frame of
 * its tilt as its box is.
 */
export function pointOnPlate(plate: ResolvedPart, xMm: number, yMm: number): Vec3Mm {
  if (plate.part.kind !== 'plate') throw new Error(`${plate.part.name} is not a plate.`);
  const view = plateView(plate.part);
  const point = centerOf(plate);
  point[faceAxis(view.right)] += signOf(view.right) * xMm;
  point[faceAxis(view.up)] += yMm;
  return point;
}

/** Where a point in the frame of a plate's tilt falls on its drawing. */
type DrawnOn = (pointMm: Vec3Mm) => { xMm: number; yMm: number };

function drawnOn(plate: ResolvedPart, part: PlatePart): DrawnOn {
  const view = plateView(part);
  const center = centerOf(plate);
  const right = faceAxis(view.right);
  const up = faceAxis(view.up);
  return (pointMm) => ({
    xMm: signOf(view.right) * (pointMm[right] - center[right]),
    yMm: pointMm[up] - center[up],
  });
}

function mountingHoles(design: PlateHoleSources, plateId: string, onPlate: DrawnOn): PlateHole[] {
  const holes: PlateHole[] = [];
  for (const peripheral of design.resolved.values()) {
    const { part } = peripheral;
    if (part.kind !== 'peripheral' || part.placement.kind !== 'attachment') continue;
    if (part.placement.parentId !== plateId) continue;
    part.mountingPattern.holes.forEach((hole, index) => {
      // A pattern lies on the peripheral's underside: X across it, Y towards its front.
      const pointMm = peripheralPointInFrame(peripheral, { x: hole.xMm, y: 0, z: hole.yMm });
      holes.push({
        kind: 'mounting',
        ...onPlate(pointMm),
        diameterMm: hole.diameterMm,
        source: `${part.name}, hole ${index + 1}`,
      });
    });
  }
  return holes;
}

function fasteningHoles(design: PlateHoleSources, plateId: string, onPlate: DrawnOn): PlateHole[] {
  const holes: PlateHole[] = [];
  for (const joint of design.joints) {
    if (joint.partId !== plateId) continue;
    const profileName = design.resolved.get(joint.toPartId)?.part.name ?? joint.toPartId;
    const bolts = design.connectors.filter(
      (connector) => connector.jointId === joint.id && isPlateBolt(connector.typeId),
    );
    bolts.forEach((bolt, index) => {
      const { min, max } = bolt.box;
      const centerMm = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
      holes.push({
        kind: 'fastening',
        ...onPlate(centerMm),
        diameterMm: plateBoltType(bolt.typeId).clearanceHoleMm,
        source: `Bolt ${index + 1} to ${profileName}`,
      });
    });
  }
  return holes;
}

const signOf = (face: Face): 1 | -1 => (face[0] === '+' ? 1 : -1);

function centerOf({ box }: ResolvedPart): Vec3Mm {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}
