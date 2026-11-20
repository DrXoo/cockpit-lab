// The ways a plate is made, which decide whether it can have slots and how much material its
// holes need around them. The values are estimated rules of thumb, recorded with their source:
// check them with the chosen shop or drill before cutting.
import type { DataSource } from './catalog.ts';

/**
 * Material to leave beside a hole, as sheet thicknesses plus diameters of the hole; between two
 * holes, of the wider one.
 */
export interface MaterialMargin {
  thicknesses: number;
  diameters: number;
}

export interface FabricationProcess {
  id: string;
  name: string;
  /** Whether it can cut a slot, or only round holes. */
  cutsSlots: boolean;
  /** The least material between a hole and the plate's edge. */
  edgeMargin: MaterialMargin;
  /** The least material between two holes. */
  holeGap: MaterialMargin;
  source: DataSource;
}

/** What a margin is measured against: the plate's sheet and the hole's diameter (a slot's width). */
export interface MarginBasis {
  thicknessMm: number;
  diameterMm: number;
}

const FABRICATION_PROCESSES: readonly FabricationProcess[] = [
  {
    id: 'laser-cutting',
    name: 'Laser or water-jet cutting',
    cutsSlots: true,
    edgeMargin: { thicknesses: 1, diameters: 0 },
    holeGap: { thicknesses: 1, diameters: 0 },
    source: {
      kind: 'estimated',
      reference:
        'A common design rule for laser and water-jet cut sheet: at least the sheet thickness of material beside each cut; check the chosen shop',
    },
  },
  {
    id: 'hand-drilling',
    name: 'Drilling by hand',
    cutsSlots: false,
    // 1.5 diameters from the edge to the center leave one diameter of material.
    edgeMargin: { thicknesses: 0, diameters: 1 },
    // 3 diameters from center to center leave two of material.
    holeGap: { thicknesses: 0, diameters: 2 },
    source: {
      kind: 'estimated',
      reference:
        'A common workshop rule for holes drilled by hand: 1.5 diameters from the edge to the center and 3 diameters between centers',
    },
  },
];

/** A new plate is laser cut. */
export const DEFAULT_PROCESS_ID = 'laser-cutting';

/** Every process in the catalog, to choose from. */
export const fabricationProcesses = (): readonly FabricationProcess[] => FABRICATION_PROCESSES;

export function fabricationProcess(id: string): FabricationProcess {
  const process = FABRICATION_PROCESSES.find((candidate) => candidate.id === id);
  if (!process) throw new Error(`Fabrication process ${id} is not in the catalog.`);
  return process;
}

/** The least material a process leaves between a hole and the plate's edge. */
export const leastEdgeMarginMm = (process: FabricationProcess, basis: MarginBasis): number =>
  marginMm(process.edgeMargin, basis);

/** The least material a process leaves between two holes, the wider one's diameter given. */
export const leastGapBetweenHolesMm = (process: FabricationProcess, basis: MarginBasis): number =>
  marginMm(process.holeGap, basis);

const marginMm = (margin: MaterialMargin, { thicknessMm, diameterMm }: MarginBasis): number =>
  margin.thicknesses * thicknessMm + margin.diameters * diameterMm;

/** What a process wants around a plate's holes, in words, for the plate's sheet. */
export function marginRuleText(process: FabricationProcess, thicknessMm: number): string {
  const { edgeMargin, holeGap } = process;
  const byThickness = edgeMargin.diameters === 0 && holeGap.diameters === 0;
  if (byThickness && edgeMargin.thicknesses === holeGap.thicknesses)
    return `At least ${edgeMargin.thicknesses * thicknessMm} mm of material beside each hole`;
  const byDiameter = edgeMargin.thicknesses === 0 && holeGap.thicknesses === 0;
  // From a hole's center: its radius plus the material beside it.
  if (byDiameter)
    return `${edgeMargin.diameters + 0.5} diameters from the edge to a hole’s center, ${holeGap.diameters + 1} between centers`;
  return `${marginText(edgeMargin, thicknessMm)} of material to the edge, ${marginText(holeGap, thicknessMm)} between holes`;
}

const marginText = (margin: MaterialMargin, thicknessMm: number): string =>
  `${margin.thicknesses * thicknessMm} mm and ${margin.diameters} diameters`;
