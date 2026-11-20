// The subassemblies of a cockpit design: parts that are taken off and put back as a whole. They
// are stored beside the design history, not in it (docs/adr/0007): a subassembly is a name and
// its root part, and its parts are those that hang from the root in the design replayed.
import type { ResolvedPart } from '../parts/assembly.ts';
import { cleanUserText } from '../../../shared/user-text.ts';
import { makesAPart, MAX_PART_NAME_LENGTH, operationMaking, type Operation } from './operations.ts';
import { replayDesign } from './replay.ts';

/** A subassembly as the design stores it. */
export interface Subassembly {
  name: string;
  /** The part everything else in it hangs from. */
  rootId: string;
}

/** A subassembly whose root is in the design replayed, with the parts that belong to it. */
export interface AppliedSubassembly extends Subassembly {
  /** Its root and every part that hangs from it, through others, in the order they were made. */
  partIds: readonly string[];
  /** The innermost other subassembly that holds its root, or null when none does. */
  parentRootId: string | null;
}

/** A span outside a subassembly that reaches one of its parts. */
export interface SpanIntoSubassembly {
  spanId: string;
  reachesId: string;
  /** The innermost subassembly that holds the part reached and not the span. */
  rootId: string;
}

/**
 * The subassemblies that apply in a replayed design, with their parts. One whose root is not
 * there, as its step was deleted or the part removed, does not apply: it is not a failure.
 */
export function appliedSubassemblies(
  subassemblies: readonly Subassembly[],
  resolved: ReadonlyMap<string, ResolvedPart>,
): AppliedSubassembly[] {
  const children = childrenByParent(resolved);
  const found = subassemblies
    .filter(({ rootId }) => resolved.has(rootId))
    .map((subassembly) => ({
      ...subassembly,
      partIds: hangingFrom(subassembly.rootId, children, resolved),
    }));
  return found.map((subassembly) => ({
    ...subassembly,
    parentRootId: innermostOf(found, subassembly.rootId, subassembly.rootId)?.rootId ?? null,
  }));
}

/** The innermost subassembly a part belongs to, if any. */
export const innermostSubassembly = (
  applied: readonly AppliedSubassembly[],
  partId: string,
): AppliedSubassembly | undefined => innermostOf(applied, partId);

/**
 * The spans outside a subassembly that reach one of its parts, which taking it off would leave
 * with an open end. A part outside cannot hang from one inside, as it would belong to it.
 */
export function spansReachingSubassemblies(
  applied: readonly AppliedSubassembly[],
  resolved: ReadonlyMap<string, ResolvedPart>,
): SpanIntoSubassembly[] {
  return [...resolved.values()].flatMap(({ part }) => {
    if (part.kind !== 'profile' || part.placement.kind !== 'span') return [];
    const { reachesId } = part.placement;
    const outside = applied.filter(
      ({ partIds }) => partIds.includes(reachesId) && !partIds.includes(part.id),
    );
    const innermost = smallest(outside);
    return innermost ? [{ spanId: part.id, reachesId, rootId: innermost.rootId }] : [];
  });
}

/**
 * The subassembly of each step that makes a part, by the step's id: the innermost one holding
 * its part where the view shows the design, at the history marker `at`, or, for a step after
 * it, in the whole design. A step whose part neither has, as it was removed, has none.
 */
export function subassemblyOfEachStep(
  history: readonly Operation[],
  subassemblies: readonly Subassembly[],
  at: number,
): Map<string, AppliedSubassembly> {
  const tags = new Map<string, AppliedSubassembly>();
  if (subassemblies.length === 0) return tags;
  const shown = appliedSubassemblies(subassemblies, replayDesign(history, at).resolved);
  const whole =
    at < history.length
      ? appliedSubassemblies(subassemblies, replayDesign(history).resolved)
      : shown;
  history.forEach((operation, index) => {
    if (!makesAPart(operation)) return;
    const applied = index < at ? shown : whole;
    const found = innermostSubassembly(applied, operation.partId);
    if (found) tags.set(operation.id, found);
  });
  return tags;
}

/** Makes a part the root of a new subassembly, named after it. */
export function makeSubassembly(
  subassemblies: readonly Subassembly[],
  history: readonly Operation[],
  partId: string,
): Subassembly[] {
  const making = operationMaking(history, partId);
  if (!making) throw new Error(`The design has no part ${partId} to make a subassembly of.`);
  if (subassemblies.some(({ rootId }) => rootId === partId))
    throw new Error(`${making.name} is already the root of a subassembly.`);
  return [...subassemblies, { name: making.name, rootId: partId }];
}

/** Renames the subassembly of a root; a name left empty keeps the one it had. */
export const renameSubassembly = (
  subassemblies: readonly Subassembly[],
  rootId: string,
  name: string,
): Subassembly[] =>
  subassemblies.map((subassembly) =>
    subassembly.rootId === rootId
      ? { ...subassembly, name: cleanUserText(name, subassembly.name, MAX_PART_NAME_LENGTH) }
      : subassembly,
  );

/** Ungroups the subassembly of a root; its parts stay in the design. */
export const ungroupSubassembly = (
  subassemblies: readonly Subassembly[],
  rootId: string,
): Subassembly[] => subassemblies.filter((subassembly) => subassembly.rootId !== rootId);

/** The parts that hang from each part, attached to it or spanning out of it. */
function childrenByParent(resolved: ReadonlyMap<string, ResolvedPart>): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const { part } of resolved.values()) {
    if (part.placement.kind === 'anchor') continue;
    const { parentId } = part.placement;
    children.set(parentId, [...(children.get(parentId) ?? []), part.id]);
  }
  return children;
}

/** A root and every part that hangs from it, through others, in the order they were made. */
function hangingFrom(
  rootId: string,
  children: ReadonlyMap<string, readonly string[]>,
  resolved: ReadonlyMap<string, ResolvedPart>,
): string[] {
  const held = new Set<string>();
  const waiting = [rootId];
  for (let next = waiting.pop(); next !== undefined; next = waiting.pop()) {
    held.add(next);
    waiting.push(...(children.get(next) ?? []));
  }
  return [...resolved.keys()].filter((id) => held.has(id));
}

/** Subassemblies nest, so the innermost of those holding a part is the one with fewest parts. */
function innermostOf<T extends AppliedSubassembly | Omit<AppliedSubassembly, 'parentRootId'>>(
  applied: readonly T[],
  partId: string,
  exceptRootId?: string,
): T | undefined {
  return smallest(
    applied.filter(({ rootId, partIds }) => rootId !== exceptRootId && partIds.includes(partId)),
  );
}

function smallest<T extends { partIds: readonly string[] }>(found: readonly T[]): T | undefined {
  return found.reduce<T | undefined>(
    (best, next) => (best === undefined || next.partIds.length < best.partIds.length ? next : best),
    undefined,
  );
}
