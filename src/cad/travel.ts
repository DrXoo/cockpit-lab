// Parts along their travels (CONTEXT.md: Adjustment, Fitting). A design is replayed with every
// part at the center of its travel, where its joints, connectors and cuts are, so none of them
// depends on where a part is along it. The fitted pose then moves each adjusted part as far
// along its travel as its position says, and with it what hangs from it: that is the cockpit as
// the driver sits in it, which the view and interference show. Lengths are in mm.
import {
  faceAxis,
  type Axis,
  type BoxMm,
  type Face,
  type ResolvedPart,
  type Vec3Mm,
} from './assembly.ts';
import type { PlacedConnector } from './connectors.ts';
import { CAD_CONTACT_MM } from './interference.ts';
import {
  adjustmentOf,
  AXES,
  makesAPart,
  type Adjustment,
  type AdjustableOperation,
  type Operation,
} from './operations.ts';

/** A span whose ends would move apart or together with the adjusted parts where they are. */
export interface ChangedSpan {
  partId: string;
  reachesId: string;
  /** How much longer it would have to be to still meet the part it reaches; less when negative. */
  changeMm: number;
}

/** The design with its adjusted parts where their positions put them. */
export interface FittedPose {
  resolved: Map<string, ResolvedPart>;
  connectors: PlacedConnector[];
  /** A span keeps its length as the parts move: one that no longer meets its part is listed. */
  changedSpans: ChangedSpan[];
}

const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };

/**
 * The fitted pose of a design replayed at the centers of its travels. A part moves as far as
 * its own adjustment says plus as far as the part it hangs from moved. A corner bracket goes
 * with the part it fastens, as its T-nut slides in the slot of the part it meets; a plate's
 * bolts stay in the slots of its profile, as the plate slides on them.
 */
export function fittedPose(
  history: readonly Operation[],
  resolved: ReadonlyMap<string, ResolvedPart>,
  connectors: readonly PlacedConnector[],
): FittedPose {
  const adjustments = new Map<string, Adjustment>();
  for (const operation of history.filter(makesAPart)) {
    const adjustment = adjustmentOf(operation);
    if (adjustment) adjustments.set(operation.partId, adjustment);
  }
  const shifts = new Map<string, Vec3Mm>();
  const shiftOf = (partId: string): Vec3Mm => {
    const known = shifts.get(partId);
    if (known) return known;
    const placement = resolved.get(partId)?.part.placement;
    if (!placement || placement.kind === 'anchor') return ORIGIN;
    const shift = { ...shiftOf(placement.parentId) };
    const adjustment = adjustments.get(partId);
    if (placement.kind === 'attachment' && adjustment)
      shift[adjustment.axis] += adjustment.positionMm;
    shifts.set(partId, shift);
    return shift;
  };
  const fitted = new Map<string, ResolvedPart>();
  for (const [id, part] of resolved) fitted.set(id, { ...part, box: moved(part.box, shiftOf(id)) });
  return {
    resolved: fitted,
    connectors: connectors.map((connector) => ({
      ...connector,
      box: moved(connector.box, shiftOf(carrierOf(connector, resolved))),
    })),
    changedSpans: changedSpans(resolved, shiftOf),
  };
}

/** The part a connector moves with: a plate's profile for its bolts, else the part it fastens. */
function carrierOf(
  connector: PlacedConnector,
  resolved: ReadonlyMap<string, ResolvedPart>,
): string {
  const [joinedId = '', metId = ''] = connector.jointId.split('@');
  return resolved.get(joinedId)?.part.kind === 'plate' ? metId : joinedId;
}

/** The spans whose own part and the part they reach moved apart or together along them. */
function changedSpans(
  resolved: ReadonlyMap<string, ResolvedPart>,
  shiftOf: (partId: string) => Vec3Mm,
): ChangedSpan[] {
  const changed: ChangedSpan[] = [];
  for (const { part, openEnd } of resolved.values()) {
    if (part.kind !== 'profile' || part.placement.kind !== 'span' || openEnd) continue;
    const { face, reachesId } = part.placement;
    const axis = faceAxis(face);
    const changeMm = (shiftOf(reachesId)[axis] - shiftOf(part.id)[axis]) * faceSign(face);
    if (Math.abs(changeMm) > CAD_CONTACT_MM) changed.push({ partId: part.id, reachesId, changeMm });
  }
  return changed;
}

const faceSign = (face: Face): 1 | -1 => (face[0] === '+' ? 1 : -1);

function moved(box: BoxMm, shiftMm: Vec3Mm): BoxMm {
  return {
    min: { x: box.min.x + shiftMm.x, y: box.min.y + shiftMm.y, z: box.min.z + shiftMm.z },
    max: { x: box.max.x + shiftMm.x, y: box.max.y + shiftMm.y, z: box.max.z + shiftMm.z },
  };
}

/**
 * The operation with its part attached `slideMm` along `axis` from where it is: how an end of
 * its travel is checked. `alongAxis` is the axis its place along its parent is measured on.
 */
export function slidOperation<T extends AdjustableOperation>(
  operation: T,
  alongAxis: Axis,
  axis: Axis,
  slideMm: number,
): T {
  if (axis !== alongAxis) return { ...operation, acrossMm: operation.acrossMm + slideMm };
  const sign = operation.fromEnd === 'start' ? 1 : -1;
  return { ...operation, alongMm: operation.alongMm + sign * slideMm };
}

/** A position brought within a travel, centered on 0. */
export function withinTravel(positionMm: number, travelMm: number): number {
  return Math.min(Math.max(positionMm, -travelMm / 2), travelMm / 2);
}

/**
 * The adjustment of a part moved to `face`: kept while its axis lies on the face, otherwise
 * along `preferred`, or the other axis of the face when that one is out of it too.
 */
export function adjustmentOnFace(
  adjustment: Adjustment | undefined,
  face: Face,
  preferred: Axis,
): Adjustment | undefined {
  if (adjustment === undefined) return undefined;
  const normal = faceAxis(face);
  if (adjustment.axis !== normal) return adjustment;
  const axis =
    preferred !== normal ? preferred : (AXES.find((other) => other !== normal) ?? preferred);
  return { ...adjustment, axis };
}

/**
 * The adjustment of a peripheral once it faces `facing` on `face`, turned with it: along the
 * way it faces if it ran that way, as a seat's rails do, and across it otherwise.
 */
export function adjustmentTurnedWith(
  adjustment: Adjustment | undefined,
  wasFacing: Face,
  face: Face,
  facing: Face,
): Adjustment | undefined {
  if (adjustment === undefined) return undefined;
  const along = faceAxis(facing);
  const across = AXES.find((axis) => axis !== along && axis !== faceAxis(face)) ?? along;
  return { ...adjustment, axis: adjustment.axis === faceAxis(wasFacing) ? along : across };
}
