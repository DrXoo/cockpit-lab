// The cockpit design: its design history, the ordered list of operations that builds it, in mm
// (docs/adr/0005). A project has at most one, and until the mini CAD is complete no room
// includes it (docs/adr/0004).

/**
 * One step of a design history. There are no kinds of operation yet: the first one, adding an
 * anchored profile, comes with the next stage of the editor. Every kind is part of the file
 * format, so a history saved with one this version doesn't know is rejected.
 */
export type Operation = never;

export interface CockpitDesign {
  history: readonly Operation[];
}

/** A cockpit design as project and cockpit files store it, with its units. */
export interface CockpitDesignData {
  units: 'mm';
  history: readonly Operation[];
}

/** A new design starts empty. */
export const emptyDesign = (): CockpitDesign => ({ history: [] });

export const designData = (design: CockpitDesign): CockpitDesignData => ({
  units: 'mm',
  history: design.history,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The design a file stores. Throws a user-facing message when it can't be used. */
export function readDesign(data: unknown): CockpitDesign {
  if (!isPlainRecord(data)) throw new Error('Invalid cockpit design');
  if (data.units !== 'mm') throw new Error('Unsupported cockpit design units');
  const { history } = data;
  if (!Array.isArray(history)) throw new Error('Invalid design history');
  if (history.length > 0) throw new Error('Unknown operation in the design history');
  return emptyDesign();
}
