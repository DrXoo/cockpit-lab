// The catalog of profile systems, connectors and fasteners the CAD builds with.
// Every dimension records its source, so measured or estimated values are never
// mistaken for a manufacturer's data sheet.
import type { ContactPoint, Envelope } from './assembly.ts';
import type { MountingPattern } from './plate.ts';

export interface DataSource {
  kind: 'data sheet' | 'measured' | 'estimated';
  /** A URL for a data sheet; for other kinds, how the value was obtained. */
  reference: string;
}
export const DATA_SOURCE_KINDS: readonly DataSource['kind'][] = [
  'data sheet',
  'measured',
  'estimated',
];

export interface ProfileSection {
  id: string;
  widthMm: number;
  heightMm: number;
  source: DataSource;
}

export interface ProfileSystem {
  id: string;
  supplier: string;
  series: number;
  slotType: string;
  slotWidthMm: number;
  sections: readonly ProfileSection[];
}

export interface FastenerCount {
  id: string;
  quantity: number;
}

export interface ConnectorType {
  id: string;
  name: string;
  /** Ids of the profile systems this connector fits. */
  fitsSystems: readonly string[];
  legs: number;
  fastenersPerLeg: readonly FastenerCount[];
  /** How far each leg reaches from the joint's corner, along the part it rests on. */
  legMm: number;
  /** Across the legs, along the corner. */
  widthMm: number;
  /** Of the plate each leg is made of, for drawing it. */
  thicknessMm: number;
  source: DataSource;
}

/** A leveling foot or locking caster, with the box it takes up under the profile. */
export interface FootType {
  id: string;
  name: string;
  heightMm: number;
  /** Across the cockpit, along X. */
  widthMm: number;
  /** Along the cockpit, along Z. */
  depthMm: number;
  source: DataSource;
}

const motedisDataSheet = (path: string): DataSource => ({
  kind: 'data sheet',
  reference: `https://www.motedis.es/en/${path}`,
});

export const MOTEDIS_SERIES_40_SLOT_8: ProfileSystem = {
  id: 'motedis-40-i-slot-8',
  supplier: 'Motedis',
  series: 40,
  slotType: 'I',
  slotWidthMm: 8,
  sections: [
    {
      id: '40x40',
      widthMm: 40,
      heightMm: 40,
      source: motedisDataSheet('Profile-40x40L-I-Type-slot-8'),
    },
    {
      id: '40x80',
      widthMm: 40,
      heightMm: 80,
      source: motedisDataSheet('Profile-40x80L-I-type-slot-8'),
    },
    {
      id: '40x120',
      widthMm: 40,
      heightMm: 120,
      source: motedisDataSheet('Profile-40x120L-I-Type-slot-8'),
    },
  ],
};

const CONNECTOR_TYPES: readonly ConnectorType[] = [
  {
    id: 'corner-bracket-40',
    name: '40 corner bracket',
    fitsSystems: [MOTEDIS_SERIES_40_SLOT_8.id],
    legs: 2,
    fastenersPerLeg: [
      { id: 'bolt-m8', quantity: 2 },
      { id: 't-nut-slot-8-m8', quantity: 2 },
    ],
    legMm: 40,
    widthMm: 36,
    thicknessMm: 4,
    source: {
      kind: 'estimated',
      reference:
        'Two M8 bolts per leg, as agreed for the first catalog, and a size that fits a 40 mm face; check the data sheet',
    },
  },
];

const PROFILE_SYSTEMS: readonly ProfileSystem[] = [MOTEDIS_SERIES_40_SLOT_8];

export const FROM_THE_DRAWING: DataSource = {
  kind: 'estimated',
  reference: 'As the parametric drawing shows it; check the chosen product',
};

const FOOT_TYPES: readonly FootType[] = [
  {
    id: 'leveling-foot',
    name: 'Leveling foot',
    heightMm: 60,
    widthMm: 72,
    depthMm: 72,
    source: FROM_THE_DRAWING,
  },
  {
    id: 'locking-caster',
    name: 'Locking caster',
    heightMm: 60,
    widthMm: 40,
    depthMm: 66,
    source: FROM_THE_DRAWING,
  },
];

/** What a peripheral is, which decides how it is drawn and where the driver meets it. */
export type PeripheralCategory = 'seat' | 'wheel-base' | 'pedals';
export const PERIPHERAL_CATEGORIES: readonly PeripheralCategory[] = [
  'seat',
  'wheel-base',
  'pedals',
];

/**
 * A kind of peripheral, whose values are copied into a design when one is mounted, so a saved
 * design never changes with the catalog. Its envelope, mounting pattern and contact points are
 * measured in the peripheral's own frame (src/cad/assembly.ts); the holes of the pattern lie on
 * its underside, their X across it and their Y towards its front.
 */
export interface PeripheralType {
  id: string;
  name: string;
  category: PeripheralCategory;
  envelope: Envelope;
  mountingPattern: MountingPattern;
  contactPoints: readonly ContactPoint[];
  /** For a seat, the backrest's angle back from upright. */
  backrestDeg?: number;
  source: DataSource;
}

/** Four holes at the corners of a rectangle centered on the mounting origin. */
function holesAtCorners(acrossMm: number, alongMm: number, diameterMm: number): MountingPattern {
  const holes = [-1, 1].flatMap((acrossSign) =>
    [-1, 1].map((alongSign) => ({
      xMm: (acrossSign * acrossMm) / 2,
      yMm: (alongSign * alongMm) / 2,
      diameterMm,
    })),
  );
  return { holes };
}

/** Clearance holes for M8 and M6 bolts. */
export const M8_CLEARANCE_MM = 8.5;
const M6_CLEARANCE_MM = 6.5;

const GENERIC_PERIPHERAL: DataSource = {
  kind: 'estimated',
  reference: 'Typical of the kind, not of a product; measure the chosen one',
};

/**
 * The generic peripherals of stage 5, until named products come with verified catalogs. Each
 * faces the way the driver does: the seat's hip, the rim of the wheel and the heels on the pedals
 * lie towards its back (−Z).
 */
const PERIPHERAL_TYPES: readonly PeripheralType[] = [
  {
    id: 'generic-seat',
    name: 'Bucket seat',
    category: 'seat',
    envelope: { widthMm: 540, heightMm: 900, depthMm: 700 },
    mountingPattern: holesAtCorners(360, 320, M8_CLEARANCE_MM),
    contactPoints: [{ role: 'hip', offsetMm: { x: 0, y: 110, z: -170 } }],
    backrestDeg: 25,
    source: GENERIC_PERIPHERAL,
  },
  {
    id: 'generic-wheel-base',
    name: 'Wheel base and wheel',
    category: 'wheel-base',
    envelope: { widthMm: 300, heightMm: 300, depthMm: 330 },
    mountingPattern: holesAtCorners(80, 120, M6_CLEARANCE_MM),
    contactPoints: [{ role: 'hands', offsetMm: { x: 0, y: 150, z: -150 } }],
    source: GENERIC_PERIPHERAL,
  },
  {
    id: 'generic-pedals',
    name: 'Pedal set',
    category: 'pedals',
    envelope: { widthMm: 400, heightMm: 200, depthMm: 320 },
    mountingPattern: holesAtCorners(320, 240, M8_CLEARANCE_MM),
    contactPoints: [{ role: 'heel', offsetMm: { x: 0, y: 30, z: -130 } }],
    source: GENERIC_PERIPHERAL,
  },
];

/** Every peripheral type in the catalog: a seat, a wheel base and pedals. */
export const peripheralTypes = (): readonly PeripheralType[] => PERIPHERAL_TYPES;

export function peripheralType(id: string): PeripheralType {
  const type = PERIPHERAL_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new Error(`Peripheral type ${id} is not in the catalog.`);
  return type;
}

/** A sheet that plates are cut from. */
export interface SheetType {
  id: string;
  name: string;
  thicknessMm: number;
  source: DataSource;
}

/** The thicknesses agreed for the first catalog; no supplier has been chosen yet. */
const STOCKED_ALUMINIUM_MM = [3, 4, 5, 6, 8, 10] as const;

const SHEET_TYPES: readonly SheetType[] = STOCKED_ALUMINIUM_MM.map((thicknessMm) => ({
  id: `aluminium-${thicknessMm}`,
  name: `Aluminium sheet, ${thicknessMm} mm`,
  thicknessMm,
  source: {
    kind: 'estimated',
    reference: 'Common stocked thicknesses of aluminium sheet; check the chosen supplier',
  },
}));

/** Every sheet in the catalog, thinnest first, to choose from. */
export const sheetTypes = (): readonly SheetType[] => SHEET_TYPES;

export function sheetType(id: string): SheetType {
  const type = SHEET_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new Error(`Sheet ${id} is not in the catalog.`);
  return type;
}

/**
 * A bolt that fastens a plate to a profile: through the plate into a T-nut in the profile's
 * slot, its head standing on the plate.
 */
export interface PlateBoltType {
  id: string;
  name: string;
  /** Ids of the profile systems whose slots its T-nut fits. */
  fitsSystems: readonly string[];
  tNutId: string;
  /** Across the head, which sits on the plate. */
  headWidthMm: number;
  headHeightMm: number;
  /** How far the bolt reaches past the plate, into its T-nut, without touching the slot's floor. */
  intoTheSlotMm: number;
  /** The lengths it is stocked in, shortest first, each a fastener type `bolt-m8x<length>`. */
  stockedLengthsMm: readonly number[];
  source: DataSource;
}

const PLATE_BOLT_SOURCE: DataSource = {
  kind: 'estimated',
  reference:
    'An M8 socket head bolt into a slot 8 T-nut, with a common head size and stocked lengths; check the chosen supplier',
};

const PLATE_BOLT_TYPES: readonly PlateBoltType[] = [
  {
    id: 'plate-bolt-m8',
    name: 'M8 bolt into a T-nut',
    fitsSystems: [MOTEDIS_SERIES_40_SLOT_8.id],
    tNutId: 't-nut-slot-8-m8',
    headWidthMm: 13,
    headHeightMm: 8,
    intoTheSlotMm: 8,
    stockedLengthsMm: [12, 16, 20, 25, 30],
    source: PLATE_BOLT_SOURCE,
  },
];

export function plateBoltType(id: string): PlateBoltType {
  const type = PLATE_BOLT_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new Error(`Plate bolt ${id} is not in the catalog.`);
  return type;
}

/** Whether a connector type is a plate bolt rather than a bracket. */
export const isPlateBolt = (typeId: string): boolean =>
  PLATE_BOLT_TYPES.some((type) => type.id === typeId);

/** The shortest stocked length that goes through a plate this thick and into its T-nut. */
export function boltLengthFor(type: PlateBoltType, plateThicknessMm: number): number {
  const neededMm = plateThicknessMm + type.intoTheSlotMm;
  const length = type.stockedLengthsMm.find((lengthMm) => lengthMm >= neededMm);
  if (length === undefined)
    throw new Error(`No ${type.name} is stocked long enough for a ${plateThicknessMm} mm plate.`);
  return length;
}

/** The fastener type of a plate bolt at one of its stocked lengths. */
export const plateBoltFastenerId = (lengthMm: number): string => `bolt-m8x${lengthMm}`;

export interface FastenerType {
  id: string;
  name: string;
  /** Where its size comes from, when it is not the connector's that counts it. */
  source?: DataSource;
}

const FASTENER_TYPES: readonly FastenerType[] = [
  { id: 'bolt-m8', name: 'M8 bolt' },
  { id: 't-nut-slot-8-m8', name: 'T-nut, slot 8, M8' },
  ...PLATE_BOLT_TYPES[0].stockedLengthsMm.map((lengthMm) => ({
    id: plateBoltFastenerId(lengthMm),
    name: `M8 × ${lengthMm} bolt`,
    source: PLATE_BOLT_SOURCE,
  })),
];

export function fastenerType(id: string): FastenerType {
  const type = FASTENER_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new Error(`Fastener type ${id} is not in the catalog.`);
  return type;
}

/** Every foot type in the catalog, to choose from. */
export const footTypes = (): readonly FootType[] => FOOT_TYPES;

export function footType(id: string): FootType {
  const type = FOOT_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new Error(`Foot type ${id} is not in the catalog.`);
  return type;
}

export function profileSystem(id: string): ProfileSystem {
  const system = PROFILE_SYSTEMS.find((candidate) => candidate.id === id);
  if (!system) throw new Error(`Profile system ${id} is not in the catalog.`);
  return system;
}

export function profileSection(system: ProfileSystem, sectionId: string): ProfileSection {
  const section = system.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Profile section ${sectionId} is not in ${system.id}.`);
  return section;
}

export function connectorType(id: string): ConnectorType {
  const type = CONNECTOR_TYPES.find((candidate) => candidate.id === id);
  if (!type) throw new Error(`Connector type ${id} is not in the catalog.`);
  return type;
}

export function connectorFits(type: ConnectorType, system: ProfileSystem): boolean {
  return type.fitsSystems.includes(system.id);
}

/** The fasteners one connector of this type needs. */
export function fastenersOf(type: ConnectorType): FastenerCount[] {
  return type.fastenersPerLeg.map((fastener) => ({
    id: fastener.id,
    quantity: fastener.quantity * type.legs,
  }));
}
