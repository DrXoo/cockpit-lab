// Replaying a design history, step by step, into the parts it makes (docs/adr/0005). An
// operation that no longer applies, because the part it refers to is gone or it no longer fits
// there, is a failed operation: it adds nothing, so what depends on it fails too, and the rest
// still applies. Replaying can stop at the history marker, to show the design at that step.
import {
  anchorWhereItIs,
  faceAxis,
  resolveAssembly,
  type Face,
  type Part,
  type ResolvedPart,
} from './assembly.ts';
import {
  AXES,
  makesAPart,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  partMadeBy,
  type MakingOperation,
  type Operation,
  type RemovePart,
} from './operations.ts';

export interface ReplayedDesign {
  /** The parts the replayed steps leave, in the order they were made. */
  parts: Part[];
  resolved: Map<string, ResolvedPart>;
  /** Why each failed operation no longer applies, by operation id. */
  failures: Map<string, string>;
}

/** Replays the first `upTo` operations: all of them unless the history marker is back. */
export function replayDesign(
  history: readonly Operation[],
  upTo: number = history.length,
): ReplayedDesign {
  const steps = history.slice(0, upTo);
  // Whether a span is long enough is only known once every part it may reach is placed, so a
  // span found too short or too long fails and the steps are replayed again without it.
  const lateFailures = new Map<string, string>();
  for (;;) {
    const design = replaySteps(history, steps, lateFailures);
    const found = misfitSpans(history, design);
    if (found.size === 0) return design;
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
  const failures = new Map(lateFailures);
  steps.forEach((operation, index) => {
    if (failures.has(operation.id)) return;
    const context: StepContext = { history, index, parts, failures };
    const result =
      operation.kind === 'remove-part' ? removal(operation, context) : making(operation, context);
    if (typeof result === 'string') failures.set(operation.id, result);
    else parts = result;
  });
  return { parts, resolved: resolveAssembly(parts), failures };
}

interface StepContext {
  history: readonly Operation[];
  /** Where the step is in the history. */
  index: number;
  /** The parts the earlier steps left. */
  parts: readonly Part[];
  failures: ReadonlyMap<string, string>;
}

/** The parts with the one the operation makes, or why it cannot make it at this step. */
function making(operation: MakingOperation, context: StepContext): Part[] | string {
  if (operation.kind === 'add-anchored-profile') return [...context.parts, partMadeBy(operation)];
  const refers = operation.kind === 'add-foot' ? 'It stands under' : 'It grows out of';
  const missing = missingPart(operation.parentId, context, refers);
  if (missing) return missing;
  const parent = context.parts.find((part) => part.id === operation.parentId);
  if (operation.kind === 'add-foot' && parent?.kind !== 'profile')
    return `${refers} ${parent?.name ?? operation.parentId}, and a foot only goes under a profile.`;
  const parts = [...context.parts, partMadeBy(operation)];
  const place: PlaceOnAFace =
    operation.kind === 'add-foot' ? { ...operation, face: '-y', acrossMm: 0 } : operation;
  const misfit = misfitOnItsFace(place, resolveAssembly(parts));
  return misfit ?? parts;
}

/**
 * The parts without the removed one: those that hung from it are anchored where they are, and
 * spans that reached it keep the length they had, with their end left open.
 */
function removal(operation: RemovePart, context: StepContext): Part[] | string {
  const missing = missingPart(operation.removedId, context, 'It removes');
  if (missing) return missing;
  const resolved = resolveAssembly(context.parts);
  // A foot is fastened to its profile by its own adapter, so it goes with it.
  const goesWithIt = (part: Part) =>
    part.id === operation.removedId ||
    (part.kind === 'foot' && part.placement.parentId === operation.removedId);
  return context.parts
    .filter((part) => !goesWithIt(part))
    .map((part) => {
      const placement = part.placement;
      const where = resolved.get(part.id);
      if (part.kind !== 'profile' || placement.kind === 'anchor' || !where) return part;
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

/** Where on a face of its parent a grown profile or a foot is. */
interface PlaceOnAFace {
  name: string;
  parentId: string;
  face: Face;
  alongMm: number;
  acrossMm: number;
}

/** Why a part placed on a face of its parent does not stay on it, or null when it does. */
function misfitOnItsFace(
  operation: PlaceOnAFace,
  resolved: ReadonlyMap<string, ResolvedPart>,
): string | null {
  const parentPart = resolved.get(operation.parentId)?.part;
  const parent = resolved.get(operation.parentId);
  if (!parent || parentPart?.kind !== 'profile') return null;
  const normal = faceAxis(operation.face);
  if (normal === parentPart.axis) return null;
  const across = AXES.find((axis) => axis !== normal && axis !== parentPart.axis) ?? 'y';
  const faceWidthMm = parent.box.max[across] - parent.box.min[across];
  const lengthMm = Math.round(parent.lengthMm);
  if (operation.alongMm > parent.lengthMm)
    return `${operation.name} would hang off ${parentPart.name}: ${operation.alongMm} mm along it is more than its ${lengthMm} mm length.`;
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
