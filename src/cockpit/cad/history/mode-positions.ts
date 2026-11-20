// Where each adjustment is in each mode, so each mode has its own fitting (CONTEXT.md: Mode).
// The first mode, like a design without modes, has its parts where the operations put them;
// every later mode stores a position for each adjustment of the design. Lengths are in mm.
import { isAdjustable, type Operation } from './history.ts';
import { addMode, deleteMode, type Mode } from './modes.ts';
import { withinTravel } from './travel.ts';

type PositionsMm = Readonly<Record<string, number>>;

/** A design history with the modes it is fitted in. */
export interface FittedModes {
  history: Operation[];
  modes: Mode[];
}

/** Where each adjustment of a history puts its part, by the part's id. */
export function positionsOf(history: readonly Operation[]): Record<string, number> {
  const positions: Record<string, number> = {};
  for (const operation of history)
    if (isAdjustable(operation) && operation.adjustment)
      positions[operation.partId] = operation.adjustment.positionMm;
  return positions;
}

/** The history with each adjustment at the given position; one not given stays where it is. */
function withPositions(history: readonly Operation[], positions: PositionsMm): Operation[] {
  return history.map((operation) => {
    if (!isAdjustable(operation) || !operation.adjustment) return operation;
    const positionMm = positions[operation.partId];
    if (positionMm === undefined) return operation;
    const { travelMm } = operation.adjustment;
    return {
      ...operation,
      adjustment: { ...operation.adjustment, positionMm: withinTravel(positionMm, travelMm) },
    };
  });
}

const isFirst = (modes: readonly Mode[], modeId: string | null): boolean =>
  modeId === null || modes[0]?.id === modeId;

/**
 * The history as a mode fits it, each adjustment at the mode's position. The first mode, and
 * all the parts (`modeId` null), have them where the operations put them.
 */
export function historyInMode(
  history: readonly Operation[],
  modes: readonly Mode[],
  modeId: string | null,
): Operation[] {
  const mode = modes.find(({ id }) => id === modeId);
  if (mode === undefined || isFirst(modes, modeId)) return [...history];
  return withPositions(history, mode.positionsMm ?? {});
}

/**
 * A mode after the first with a position for every adjustment of the history, within its
 * travel; with no adjustments, it keeps no positions.
 */
function fittedLater(mode: Mode, history: readonly Operation[]): Mode {
  const positionsMm = positionsOf(withPositions(history, mode.positionsMm ?? {}));
  return Object.keys(positionsMm).length ? { ...mode, positionsMm } : fittedFirst(mode);
}

/** A mode without positions of its own, as the first keeps them in the operations. */
function fittedFirst({ positionsMm: _kept, ...mode }: Mode): Mode {
  return mode;
}

const fittedAll = (modes: readonly Mode[], history: readonly Operation[]): Mode[] =>
  modes.map((mode, index) => (index === 0 ? fittedFirst(mode) : fittedLater(mode, history)));

/** Adds a mode with every subassembly on, at the positions of the mode shown. */
export function addFittedMode(
  history: readonly Operation[],
  modes: readonly Mode[],
  shownModeId: string | null,
): Mode[] {
  const added = addMode(modes);
  if (modes.length === 0) return added;
  const positionsMm = positionsOf(historyInMode(history, modes, shownModeId));
  return added.map((mode, index) => (index === modes.length ? { ...mode, positionsMm } : mode));
}

/**
 * Deletes a mode. Deleting the first puts the positions of the next one into the operations,
 * as it becomes the first.
 */
export function deleteFittedMode(
  history: readonly Operation[],
  modes: readonly Mode[],
  modeId: string,
): FittedModes {
  const left = deleteMode(modes, modeId);
  const next = left[0];
  if (!isFirst(modes, modeId) || next === undefined) return { history: [...history], modes: left };
  const moved = withPositions(history, next.positionsMm ?? {});
  return { history: moved, modes: fittedAll(left, moved) };
}

/**
 * Stores a history edited as the mode shown fits it. The positions of a later mode shown go
 * into that mode, and the operations keep theirs; in the first mode, or with all the parts,
 * they stay in the operations. Every later mode then has the adjustments of the history: a new
 * one where the operations put it, none of a removed one, and each within its travel.
 */
export function keepFitting(
  edited: readonly Operation[],
  stored: readonly Operation[],
  modes: readonly Mode[],
  shownModeId: string | null,
): FittedModes {
  if (isFirst(modes, shownModeId) || !modes.some(({ id }) => id === shownModeId))
    return { history: [...edited], modes: fittedAll(modes, edited) };
  const history = withPositions(edited, positionsOf(stored));
  const fittedShown = positionsOf(edited);
  const shown = modes.map((mode) =>
    mode.id === shownModeId ? { ...mode, positionsMm: fittedShown } : mode,
  );
  return { history, modes: fittedAll(shown, history) };
}

/**
 * The modes a file stores, checked against its history: the first keeps no positions, and a
 * later one only those of adjustments the history has, within their travel. A later mode
 * stored without the position of an adjustment takes the operations'.
 */
export function checkedModePositions(
  history: readonly Operation[],
  modes: readonly Mode[],
): Mode[] {
  if (modes[0]?.positionsMm !== undefined)
    throw new Error('The first mode keeps its positions in the operations');
  const travels = new Map<string, number>();
  for (const operation of history)
    if (isAdjustable(operation) && operation.adjustment)
      travels.set(operation.partId, operation.adjustment.travelMm);
  for (const { name, positionsMm = {} } of modes)
    for (const [partId, positionMm] of Object.entries(positionsMm)) {
      const travelMm = travels.get(partId);
      if (travelMm === undefined)
        throw new Error(`The mode ${name} places ${partId}, which has no adjustment`);
      if (withinTravel(positionMm, travelMm) !== positionMm)
        throw new Error(`The mode ${name} places ${partId} beyond its travel`);
    }
  return fittedAll(modes, history);
}
