// The catalog of profile systems, connectors and fasteners the CAD builds with.
// Every dimension records its source, so measured or estimated values are never
// mistaken for a manufacturer's data sheet.

export interface DataSource {
  kind: 'data sheet' | 'measured' | 'estimated';
  /** A URL for a data sheet; for other kinds, how the value was obtained. */
  reference: string;
}

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
    source: {
      kind: 'estimated',
      reference: 'Two M8 bolts per leg, as agreed for the first catalog; check the data sheet',
    },
  },
];

const PROFILE_SYSTEMS: readonly ProfileSystem[] = [MOTEDIS_SERIES_40_SLOT_8];

const FROM_THE_DRAWING: DataSource = {
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
