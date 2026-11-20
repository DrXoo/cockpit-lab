// The modes of a cockpit design (CONTEXT.md: Mode), such as racing and flight: each says which
// subassemblies are taken off the cockpit. They are stored beside the design history, with the
// subassemblies (docs/adr/0007), and change no part: the design in a mode is the design
// replayed with the parts it takes off left out.
import { cleanUserText } from '../../../shared/user-text.ts';
import { MAX_PART_NAME_LENGTH } from './operations.ts';
import type { ReplayedDesign } from './replay.ts';
import type { AppliedSubassembly } from './subassemblies.ts';

/** A mode as the design stores it. */
export interface Mode {
  id: string;
  name: string;
  /** The roots of the subassemblies it takes off; every other part is on. */
  takenOff: readonly string[];
  /**
   * Where each adjustment is in this mode, by the id of its part. The first mode keeps none, as
   * its positions are those the operations store (`mode-positions.ts`).
   */
  positionsMm?: Readonly<Record<string, number>>;
}

/** How a subassembly is in a mode: on, taken off, or off because a subassembly holding it is. */
export type SubassemblyState = 'on' | 'off' | 'off-with-parent';

const MODE_ID_PREFIX = 'mode-';
const MODE_NAME_PREFIX = 'Mode ';

/** Adds a mode with every subassembly on, numbered after the modes there are. */
export function addMode(modes: readonly Mode[]): Mode[] {
  const taken = new Set(modes.flatMap(({ id, name }) => [id, name]));
  let number = modes.length + 1;
  while (taken.has(`${MODE_ID_PREFIX}${number}`) || taken.has(`${MODE_NAME_PREFIX}${number}`))
    number++;
  return [
    ...modes,
    { id: `${MODE_ID_PREFIX}${number}`, name: `${MODE_NAME_PREFIX}${number}`, takenOff: [] },
  ];
}

/** Renames a mode; a name left empty keeps the one it had. */
export const renameMode = (modes: readonly Mode[], id: string, name: string): Mode[] =>
  modes.map((mode) =>
    mode.id === id ? { ...mode, name: cleanUserText(name, mode.name, MAX_PART_NAME_LENGTH) } : mode,
  );

export const deleteMode = (modes: readonly Mode[], id: string): Mode[] =>
  modes.filter((mode) => mode.id !== id);

/** Puts the subassembly of a root on in a mode, or takes it off. */
export function setSubassemblyOn(
  modes: readonly Mode[],
  modeId: string,
  rootId: string,
  on: boolean,
): Mode[] {
  return modes.map((mode) => {
    if (mode.id !== modeId) return mode;
    const others = mode.takenOff.filter((taken) => taken !== rootId);
    return { ...mode, takenOff: on ? others : [...others, rootId] };
  });
}

/** Every mode without the subassembly of a root, once it is ungrouped. */
export const forgetSubassemblyInModes = (modes: readonly Mode[], rootId: string): Mode[] =>
  modes.map((mode) => ({ ...mode, takenOff: mode.takenOff.filter((taken) => taken !== rootId) }));

/**
 * How a subassembly is in a mode. One inside a subassembly taken off is off with it, whatever
 * the mode says of it, as it hangs from a part that is not there.
 */
export function subassemblyStateIn(
  mode: Mode,
  applied: readonly AppliedSubassembly[],
  rootId: string,
): SubassemblyState {
  if (mode.takenOff.includes(rootId)) return 'off';
  const holding = applied.filter(
    (subassembly) => subassembly.rootId !== rootId && subassembly.partIds.includes(rootId),
  );
  return holding.some(({ rootId: holder }) => mode.takenOff.includes(holder))
    ? 'off-with-parent'
    : 'on';
}

/** The parts a mode takes off, of the subassemblies that apply in the design replayed. */
export function partsOffIn(mode: Mode, applied: readonly AppliedSubassembly[]): Set<string> {
  return new Set(
    applied
      .filter(({ rootId }) => mode.takenOff.includes(rootId))
      .flatMap(({ partIds }) => partIds),
  );
}

/**
 * The design replayed without the parts taken off: their joints to the parts left are undone
 * and their connectors go with them, as they come off with the part. A span left on that
 * reached a part taken off keeps its length, with its end open.
 */
export function designInMode(
  design: ReplayedDesign,
  partsOff: ReadonlySet<string>,
): ReplayedDesign {
  if (partsOff.size === 0) return design;
  const on = (id: string) => !partsOff.has(id);
  const joints = design.joints.filter(({ partId, toPartId }) => on(partId) && on(toPartId));
  const jointIds = new Set(joints.map(({ id }) => id));
  const kept = <T extends { jointId: string }>(connectors: readonly T[]) =>
    connectors.filter(({ jointId }) => jointIds.has(jointId));
  return {
    ...design,
    parts: design.parts.filter(({ id }) => on(id)),
    resolved: withoutParts(design.resolved, partsOff),
    joints,
    connectors: kept(design.connectors),
    fitted: {
      resolved: withoutParts(design.fitted.resolved, partsOff),
      connectors: kept(design.fitted.connectors),
      changedSpans: design.fitted.changedSpans.filter(
        ({ partId, reachesId }) => on(partId) && on(reachesId),
      ),
    },
    adjustments: withoutParts(design.adjustments, partsOff),
  };
}

const withoutParts = <T>(byId: ReadonlyMap<string, T>, partsOff: ReadonlySet<string>) =>
  new Map([...byId].filter(([id]) => !partsOff.has(id)));
