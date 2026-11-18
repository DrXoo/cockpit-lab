// Replaying a design history, step by step, into the parts it makes (docs/adr/0005). An
// operation that no longer applies, because the part it refers to is gone or it no longer fits
// there, is a failed operation: it adds nothing, so what depends on it fails too, and the rest
// still applies. Replaying can stop at the history marker, to show the design at that step.
import {
  anchorWhereItIs,
  faceAxis,
  resolveAssembly,
  type Axis,
  type BoxMm,
  type Face,
  type Part,
  type PlatePart,
  type ProfilePart,
  type ResolvedPart,
} from './assembly.ts';
import { CAD_CONTACT_MM } from './interference.ts';
import {
  AXES,
  isBolts,
  makesAPart,
  makesAProfile,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  partMadeBy,
  type AddPlate,
  type FastenJoint,
  type JoinParts,
  type MakingOperation,
  type MountPeripheral,
  type Operation,
  type RemovePart,
} from './operations.ts';
import { placedBolts, placedConnector, type PlacedConnector } from './connectors.ts';
import {
  jointIdOf,
  jointOfTouching,
  joinedTogether,
  jointsOf,
  touchingFace,
  type Joint,
} from './joints.ts';

export interface ReplayedDesign {
  /** The parts the replayed steps leave, in the order they were made. */
  parts: Part[];
  resolved: Map<string, ResolvedPart>;
  /** Why each failed operation no longer applies, by operation id. */
  failures: Map<string, string>;
  joints: Joint[];
  /** The connectors on the joints, from the fastenings that apply. */
  connectors: PlacedConnector[];
}

/** Replays the first `upTo` operations: all of them unless the history marker is back. */
export function replayDesign(
  history: readonly Operation[],
  upTo: number = history.length,
): ReplayedDesign {
  const steps = history.slice(0, upTo);
  // Whether a span is long enough is only known once every part it may reach is placed, so a
  // span found too short or too long fails and the steps are replayed again without it. So does
  // a fastening whose connectors do not fit.
  const lateFailures = new Map<string, string>();
  for (;;) {
    const design = replaySteps(history, steps, lateFailures);
    const found = misfitSpans(history, design);
    if (found.size === 0) {
      // Connectors fit or not once every part is where it ends up, as spans do.
      const connectors = placedConnectors(steps, design);
      if (connectors.misfits.size === 0) return { ...design, connectors: connectors.placed };
      for (const [id, reason] of connectors.misfits) lateFailures.set(id, reason);
      continue;
    }
    for (const [id, reason] of found) lateFailures.set(id, reason);
  }
}

/** The parts the history makes, replayed in full. */
export const replayHistory = (history: readonly Operation[]): Part[] => replayDesign(history).parts;

function replaySteps(
  history: readonly Operation[],
  steps: readonly Operation[],
  lateFailures: ReadonlyMap<string, string>,
): ReplayedDesign {
  let parts: Part[] = [];
  const joins: JoinParts[] = [];
  const failures = new Map(lateFailures);
  steps.forEach((operation, index) => {
    if (failures.has(operation.id)) return;
    const context: StepContext = { history, index, parts, joins, failures };
    if (operation.kind === 'fasten-joint' || operation.kind === 'join-parts') {
      const reason =
        operation.kind === 'fasten-joint'
          ? missingJoint(operation, context)
          : misfitJoin(operation, context);
      if (reason) failures.set(operation.id, reason);
      else if (operation.kind === 'join-parts') joins.push(operation);
      return;
    }
    const result =
      operation.kind === 'remove-part' ? removal(operation, context) : making(operation, context);
    if (typeof result === 'string') failures.set(operation.id, result);
    else parts = result;
  });
  const resolved = resolveAssembly(parts);
  return { parts, resolved, failures, joints: jointsAt(resolved, joins), connectors: [] };
}

/**
 * The joints of the parts: one per attachment and span end, and one per join of two parts that
 * are both still there.
 */
function jointsAt(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joins: readonly JoinParts[],
): Joint[] {
  const joined = joins.flatMap((join) => {
    const part = resolved.get(join.partId);
    const other = resolved.get(join.toPartId);
    const joint = part && other ? jointOfTouching(part, other) : null;
    return joint ? [joint] : [];
  });
  return [...jointsOf(resolved), ...joined];
}

/** Why two parts cannot be joined at this step, or null when they can. */
function misfitJoin(operation: JoinParts, context: StepContext): string | null {
  const missing =
    missingPart(operation.partId, context, 'It joins') ??
    missingPart(operation.toPartId, context, 'It joins a part to');
  if (missing) return missing;
  const resolved = resolveAssembly(context.parts);
  const part = resolved.get(operation.partId);
  const other = resolved.get(operation.toPartId);
  if (!part || !other) return null;
  const names = { part: part.part.name, other: other.part.name };
  if (joinedTogether(jointsAt(resolved, context.joins), operation.partId, operation.toPartId))
    return `${names.part} and ${names.other} are joined already.`;
  if (touchingFace(part, other) === null) return `${names.part} no longer touches ${names.other}.`;
  return null;
}

/** Why the joint a fastening puts connectors on is not in the design at its step, or null. */
function missingJoint(operation: FastenJoint, context: StepContext): string | null {
  const missing =
    missingPart(operation.partId, context, 'It fastens') ??
    missingPart(operation.toPartId, context, 'It fastens a part to');
  if (missing) return missing;
  const joints = jointsAt(resolveAssembly(context.parts), context.joins);
  if (joints.some((joint) => joint.id === jointIdOf(operation))) return null;
  const nameOf = (id: string) => context.parts.find((part) => part.id === id)?.name ?? id;
  return `${nameOf(operation.partId)} is not joined to ${nameOf(operation.toPartId)} at this step.`;
}

/**
 * The connectors of the fastenings that apply, placed on the joints the design still has: a
 * joint that went with a removed part takes its connectors with it. A fastening with a connector
 * that does not fit fails, with why.
 */
function placedConnectors(
  steps: readonly Operation[],
  design: ReplayedDesign,
): { placed: PlacedConnector[]; misfits: Map<string, string> } {
  const placed: PlacedConnector[] = [];
  const misfits = new Map<string, string>();
  for (const operation of steps) {
    if (operation.kind !== 'fasten-joint' || design.failures.has(operation.id)) continue;
    const joint = design.joints.find((candidate) => candidate.id === jointIdOf(operation));
    const joined = design.resolved.get(operation.partId);
    const met = design.resolved.get(operation.toPartId);
    if (!joint || !joined || !met) continue;
    for (const choice of operation.connectors) {
      const connectors = isBolts(choice)
        ? placedBolts(joint, joined, met, { id: `${operation.id}:bolt`, ...choice })
        : placedConnector(joint, joined, met, {
            id: `${operation.id}:${choice.side}`,
            jointId: joint.id,
            ...choice,
          });
      if (typeof connectors === 'string') misfits.set(operation.id, connectors);
      else if (Array.isArray(connectors)) placed.push(...connectors);
      else placed.push(connectors);
    }
  }
  return { placed, misfits };
}

interface StepContext {
  history: readonly Operation[];
  /** Where the step is in the history. */
  index: number;
  /** The parts the earlier steps left. */
  parts: readonly Part[];
  /** The joins of the earlier steps that apply. */
  joins: readonly JoinParts[];
  failures: ReadonlyMap<string, string>;
}

/** How each kind of part that hangs from a profile refers to it, and that it needs one. */
const HANGING_FROM: Record<Exclude<MakingOperation['kind'], 'add-anchored-profile'>, string[]> = {
  'grow-profile': ['It grows out of', 'a profile only grows out of another profile'],
  'add-foot': ['It stands under', 'a foot only goes under a profile'],
  'add-plate': ['It rests on', 'a plate only rests on a profile'],
  'mount-peripheral': ['It is mounted on', 'a peripheral is mounted on a profile or a plate'],
};

/** The parts with the one the operation makes, or why it cannot make it at this step. */
function making(operation: MakingOperation, context: StepContext): Part[] | string {
  if (operation.kind === 'add-anchored-profile') return [...context.parts, partMadeBy(operation)];
  const [refers, needsAProfile] = HANGING_FROM[operation.kind];
  const missing = missingPart(operation.parentId, context, refers);
  if (missing) return missing;
  const parent = context.parts.find((part) => part.id === operation.parentId);
  if (
    operation.kind === 'mount-peripheral' &&
    (parent?.kind === 'profile' || parent?.kind === 'plate')
  )
    return withPeripheral(operation, context.parts, parent);
  if (parent?.kind !== 'profile')
    return `${refers} ${parent?.name ?? operation.parentId}, and ${needsAProfile}.`;
  if (operation.kind === 'add-plate') return withPlate(operation, context.parts, parent);
  if (operation.kind === 'grow-profile' && operation.reachesId !== undefined) {
    const reached = operationMaking(context.history, operation.reachesId);
    if (reached && !makesAProfile(reached))
      return `It reaches ${reached.name}, and a span only reaches a profile.`;
  }
  const parts = [...context.parts, partMadeBy(operation)];
  const place: PlaceOnAFace =
    operation.kind === 'add-foot' ? { ...operation, face: '-y', acrossMm: 0 } : operation;
  const misfit = misfitOnItsFace(place, resolveAssembly(parts));
  return misfit ?? parts;
}

/** The parts with the plate, or why it does not rest on a side face of its profile. */
function withPlate(
  operation: AddPlate,
  parts: readonly Part[],
  profile: ProfilePart,
): Part[] | string {
  const normal = faceAxis(operation.face);
  if (profile.axis === normal)
    return `${operation.name} rests on a side of ${profile.name}, not on its end: move it to a side.`;
  const withIt = [...parts, partMadeBy(operation)];
  const resolved = resolveAssembly(withIt);
  const plate = resolved.get(operation.partId);
  const parent = resolved.get(profile.id);
  if (plate && parent && !overlapsAcross(plate.box, parent.box, normal))
    return `${operation.name} would not rest on ${profile.name}: it lies beyond the face.`;
  return withIt;
}

/**
 * The parts with the peripheral, or why it is not on a face of its part: off the face, on an
 * end of a profile anywhere but its center, or on the edge of a plate.
 */
function withPeripheral(
  operation: MountPeripheral,
  parts: readonly Part[],
  parent: ProfilePart | PlatePart,
): Part[] | string {
  const normal = faceAxis(operation.face);
  if (parent.kind === 'plate' && normal !== faceAxis(parent.normal))
    return `${operation.name} is mounted on an edge of ${parent.name}: mount it on one of its faces.`;
  const onAnEnd = parent.kind === 'profile' && parent.axis === normal;
  if (onAnEnd && (operation.alongMm !== 0 || operation.acrossMm !== 0))
    return `${operation.name} is mounted on an end of ${parent.name}, which has only its center to mount on.`;
  const withIt = [...parts, partMadeBy(operation)];
  return misfitOnItsFace(operation, resolveAssembly(withIt)) ?? withIt;
}

/** Whether two boxes have some area in common across `normal`, more than mere contact. */
function overlapsAcross(a: BoxMm, b: BoxMm, normal: Axis): boolean {
  return AXES.filter((axis) => axis !== normal).every(
    (axis) =>
      Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > CAD_CONTACT_MM,
  );
}

/**
 * The parts without the removed one: those that hung from it are anchored where they are, and
 * spans that reached it keep the length they had, with their end left open.
 */
function removal(operation: RemovePart, context: StepContext): Part[] | string {
  const missing = missingPart(operation.removedId, context, 'It removes');
  if (missing) return missing;
  const resolved = resolveAssembly(context.parts);
  // A foot is fastened to its profile by its own adapter, and a peripheral is bolted through its
  // mounting pattern, so they go with the part they are on.
  const goesWithIt = (part: Part) =>
    part.id === operation.removedId ||
    ((part.kind === 'foot' || part.kind === 'peripheral') &&
      part.placement.kind !== 'anchor' &&
      part.placement.parentId === operation.removedId);
  return context.parts
    .filter((part) => !goesWithIt(part))
    .map((part) => {
      const placement = part.placement;
      const where = resolved.get(part.id);
      if (placement.kind === 'anchor' || !where) return part;
      if (part.kind === 'plate' && placement.parentId === operation.removedId)
        return { ...part, placement: anchorWhereItIs(where) };
      if (part.kind !== 'profile') return part;
      if (placement.parentId === operation.removedId)
        return { ...part, lengthMm: where.lengthMm, placement: anchorWhereItIs(where) };
      if (placement.kind === 'span' && placement.reachesId === operation.removedId)
        return { ...part, lengthMm: where.lengthMm };
      return part;
    });
}

/** Why a part an operation refers to is not in the design at its step, or null if it is. */
function missingPart(partId: string, context: StepContext, refers: string): string | null {
  if (context.parts.some((part) => part.id === partId)) return null;
  const { history, index, failures } = context;
  const maker = operationMaking(history, partId);
  if (!maker) return `${refers} a part that was deleted.`;
  if (failures.has(maker.id)) return `${refers} ${maker.name}, which failed.`;
  const makerIndex = history.indexOf(maker);
  if (makerIndex > index) return `${refers} ${maker.name}, made at a later step.`;
  const removedAt = history.findIndex(
    (operation, at) =>
      at > makerIndex &&
      at < index &&
      operation.kind === 'remove-part' &&
      operation.removedId === partId &&
      !failures.has(operation.id),
  );
  if (removedAt >= 0) return `${refers} ${maker.name}, removed at step ${removedAt + 1}.`;
  return `${refers} ${maker.name}, which is not in the design at this step.`;
}

/** Where on a face of its parent a grown profile, a foot or a peripheral is. */
interface PlaceOnAFace {
  name: string;
  parentId: string;
  face: Face;
  alongMm: number;
  acrossMm: number;
}

/**
 * Why a part placed on a face of its parent does not stay on it, or null when it does. Along a
 * profile it is measured on its length, along a plate on its depth.
 */
function misfitOnItsFace(
  operation: PlaceOnAFace,
  resolved: ReadonlyMap<string, ResolvedPart>,
): string | null {
  const parent = resolved.get(operation.parentId);
  if (!parent) return null;
  const parentPart = parent.part;
  const along =
    parentPart.kind === 'profile'
      ? parentPart.axis
      : parentPart.kind === 'plate'
        ? parentPart.depthAxis
        : null;
  const normal = faceAxis(operation.face);
  if (along === null || normal === along) return null;
  const across = AXES.find((axis) => axis !== normal && axis !== along) ?? 'y';
  const faceWidthMm = parent.box.max[across] - parent.box.min[across];
  const extentMm = parent.box.max[along] - parent.box.min[along];
  const extent = parentPart.kind === 'plate' ? 'depth' : 'length';
  if (operation.alongMm > extentMm)
    return `${operation.name} would hang off ${parentPart.name}: ${operation.alongMm} mm along it is more than its ${Math.round(extentMm)} mm ${extent}.`;
  if (Math.abs(operation.acrossMm) > faceWidthMm / 2)
    return `${operation.name} would hang off the side of ${parentPart.name}: an offset of ${Math.abs(operation.acrossMm)} mm is more than half its ${faceWidthMm} mm face.`;
  return null;
}

/** The spans that meet their part at a length no profile can have, with why. */
function misfitSpans(history: readonly Operation[], design: ReplayedDesign): Map<string, string> {
  const found = new Map<string, string>();
  for (const operation of history.filter(makesAPart)) {
    if (operation.kind !== 'grow-profile' || operation.reachesId === undefined) continue;
    const span = design.resolved.get(operation.partId);
    if (!span || span.openEnd) continue;
    const target = operationMaking(history, operation.reachesId)?.name ?? operation.reachesId;
    if (span.lengthMm < MIN_PROFILE_LENGTH_MM)
      found.set(
        operation.id,
        `${target} would be too close to ${operation.name} for it to reach: a profile is at least ${MIN_PROFILE_LENGTH_MM} mm long.`,
      );
    else if (span.lengthMm > MAX_PROFILE_LENGTH_MM)
      found.set(
        operation.id,
        `${operation.name} would be longer than ${MAX_PROFILE_LENGTH_MM} mm to reach ${target}.`,
      );
  }
  return found;
}
