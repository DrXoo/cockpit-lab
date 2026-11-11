// Configurator settings: ranges, defaults, presets and validation of saved data. Lengths in cm.
import { clamp } from './geometry.ts';
import { normalizeRoom, type FurnitureItem, type RoomFeature } from './room.ts';

/** Allowed range of a numeric setting: [min, max, step]. */
export type FieldRange = readonly [min: number, max: number, step: number];

// Coordinate system in cm: X lateral, Y from floor, Z from rear chassis edge.
export const fields = {
  length: [125, 180, 1],
  width: [58, 80, 1],
  baseLift: [0, 50, 1],
  seatZ: [30, 55, 1],
  seatH: [24, 48, 1],
  recline: [10, 35, 1],
  height: [155, 200, 1],
  wheelZ: [58, 105, 1],
  wheelH: [48, 90, 1],
  wheelTilt: [0, 30, 1],
  pedalZ: [90, 162, 1],
  pedalH: [10, 36, 1],
  pedalTilt: [0, 35, 1],
  hotasZ: [35, 82, 1],
  hotasH: [38, 78, 1],
  hotasOut: [8, 28, 1],
  stickZ: [48, 90, 1],
  stickH: [35, 66, 1],
  deskWidth: [120, 200, 5],
  deskDepth: [60, 80, 5],
  deskH: [66, 131, 0.5],
  deskGap: [0, 80, 1],
  deskX: [-1500, 1500, 1],
  deskZ: [-1500, 1500, 1],
  deskAngle: [0, 355, 5],
  cockpitX: [-1500, 1500, 1],
  cockpitZ: [-1500, 1500, 1],
  cockpitAngle: [0, 355, 5],
  armReach: [40, 120, 1],
  armSplit: [20, 80, 1],
  armBaseAngle: [-180, 180, 0.1],
  armElbowAngle: [-180, 180, 0.1],
  monitorYaw: [-180, 180, 0.1],
  clampX: [-34, 34, 0.1],
  clampZ: [-94, 94, 0.1],
  monitorAhead: [12, 55, 1],
  monitorH: [70, 140, 1],
  monitorInches: [24, 49, 1],
  armMinH: [5, 40, 1],
  armMaxH: [25, 75, 1],
  keyboardX: [-40, 40, 0.1],
  keyboardZ: [-100, 100, 0.1],
  keyboardAngle: [0, 355, 5],
  keyboardWidth: [26, 50, 1],
  keyboardDepth: [10, 22, 1],
  pcX: [-40, 40, 0.1],
  pcZ: [-100, 100, 0.1],
  pcAngle: [0, 355, 5],
  pcWidth: [16, 35, 1],
  pcDepth: [25, 55, 1],
  pcHeight: [20, 60, 1],
  mouseX: [-40, 40, 0.1],
  mouseZ: [-100, 100, 0.1],
  mouseAngle: [0, 355, 5],
  matX: [-40, 40, 0.1],
  matZ: [-100, 100, 0.1],
  matAngle: [0, 355, 5],
  matWidth: [60, 200, 5],
  matDepth: [25, 80, 5],
  roomX: [-1000, 1000, 1],
  roomZ: [-1000, 1000, 1],
  roomW: [120, 1200, 1],
  roomD: [120, 1200, 1],
  roomH: [180, 400, 1],
  aisle: [40, 120, 1],
} satisfies Record<string, FieldRange>;

/** A numeric setting; every one has a range in `fields`. Lengths are in cm, angles in degrees. */
export type NumericField = keyof typeof fields;

export type DrivingSide = 'right' | 'left';
export type Feet = 'level' | 'casters';
export type MonitorMode = 'cockpit' | 'desk' | 'vr' | 'manual';
export type ArmBend = 'positive' | 'negative';
export type ClampMount = 'clamp' | 'grommet';
export type ClampSide = 'xmin' | 'xmax' | 'zmin' | 'zmax';
export type PresetId = 'gt' | 'flight' | 'hybrid' | 'small';

/** The whole configurator state, as saved in project files (lengths in cm). */
export interface CockpitConfig extends Record<NumericField, number> {
  deskEnabled: boolean;
  cockpitEnabled: boolean;
  monitorEnabled: boolean;
  keyboardEnabled: boolean;
  pcEnabled: boolean;
  mouseEnabled: boolean;
  matEnabled: boolean;
  wheel: boolean;
  hotas: boolean;
  centerStick: boolean;
  shifter: boolean;
  handbrake: boolean;
  drivingSide: DrivingSide;
  feet: Feet;
  armBend: ArmBend;
  clampMount: ClampMount;
  clampSide: ClampSide;
  monitorMode: MonitorMode;
  roomEnabled: boolean;
  roomFullWalls: boolean;
  roomFeatures: RoomFeature[];
  roomFurniture: FurnitureItem[];
  preset: PresetId;
}

export const defaults: CockpitConfig = {
  deskEnabled: true,
  cockpitEnabled: true,
  monitorEnabled: true,
  keyboardEnabled: true,
  pcEnabled: true,
  mouseEnabled: true,
  matEnabled: true,
  length: 145,
  width: 64,
  baseLift: 0,
  seatZ: 40,
  seatH: 32,
  recline: 20,
  height: 178,
  wheelZ: 74,
  wheelH: 68,
  wheelTilt: 15,
  pedalZ: 118,
  pedalH: 18,
  pedalTilt: 18,
  wheel: true,
  hotas: false,
  centerStick: false,
  shifter: true,
  handbrake: true,
  drivingSide: 'right',
  feet: 'level',
  hotasZ: 53,
  hotasH: 53,
  hotasOut: 15,
  stickZ: 68,
  stickH: 48,
  deskWidth: 140,
  deskDepth: 80,
  deskH: 75,
  deskGap: 30,
  deskX: 102,
  deskZ: 95,
  deskAngle: 0,
  cockpitX: 0,
  cockpitZ: 0,
  cockpitAngle: 0,
  armReach: 85,
  armSplit: 50,
  armBaseAngle: 0,
  armElbowAngle: 0,
  monitorYaw: 90,
  armBend: 'positive',
  clampX: -34,
  clampZ: -15,
  clampMount: 'clamp',
  clampSide: 'xmin',
  monitorAhead: 24,
  monitorH: 108,
  monitorInches: 34,
  armMinH: 5,
  armMaxH: 55,
  monitorMode: 'cockpit',
  keyboardX: -23,
  keyboardZ: -16,
  keyboardAngle: 0,
  keyboardWidth: 32,
  keyboardDepth: 12,
  pcX: 22,
  pcZ: 43,
  pcAngle: 0,
  pcWidth: 21,
  pcDepth: 38,
  pcHeight: 30,
  mouseX: -23,
  mouseZ: 27,
  mouseAngle: 0,
  matX: -15,
  matZ: 0,
  matAngle: 0,
  matWidth: 90,
  matDepth: 40,
  roomX: -100,
  roomZ: -100,
  roomW: 260,
  roomD: 280,
  roomH: 250,
  roomEnabled: true,
  roomFullWalls: false,
  roomFeatures: [],
  roomFurniture: [],
  aisle: 60,
  preset: 'gt',
};
/** Rig settings applied by a preset. */
export type PresetValues = Pick<
  CockpitConfig,
  | 'length'
  | 'width'
  | 'seatZ'
  | 'seatH'
  | 'recline'
  | 'wheelZ'
  | 'wheelH'
  | 'wheelTilt'
  | 'pedalZ'
  | 'pedalH'
  | 'pedalTilt'
  | 'wheel'
  | 'hotas'
  | 'centerStick'
  | 'shifter'
  | 'handbrake'
  | 'hotasZ'
  | 'hotasH'
  | 'hotasOut'
  | 'stickZ'
  | 'stickH'
>;

export const presets: Record<
  PresetId,
  { label: string; description: string; values: PresetValues }
> = {
  gt: {
    label: 'GT compacto',
    description: 'Asiento de coche, tres pedales y mandos a mano.',
    values: {
      length: 145,
      width: 64,
      seatZ: 40,
      seatH: 32,
      recline: 20,
      wheelZ: 74,
      wheelH: 68,
      wheelTilt: 15,
      pedalZ: 118,
      pedalH: 18,
      pedalTilt: 18,
      wheel: true,
      hotas: false,
      centerStick: false,
      shifter: true,
      handbrake: true,
      hotasZ: 53,
      hotasH: 53,
      hotasOut: 15,
      stickZ: 68,
      stickH: 48,
    },
  },
  flight: {
    label: 'Vuelo VR',
    description: 'HOTAS lateral, pedales bajos y frontal despejado.',
    values: {
      length: 145,
      width: 64,
      seatZ: 40,
      seatH: 36,
      recline: 15,
      wheelZ: 76,
      wheelH: 72,
      wheelTilt: 10,
      pedalZ: 120,
      pedalH: 12,
      pedalTilt: 8,
      wheel: false,
      hotas: true,
      centerStick: false,
      shifter: false,
      handbrake: false,
      hotasZ: 55,
      hotasH: 58,
      hotasOut: 15,
      stickZ: 68,
      stickH: 48,
    },
  },
  hybrid: {
    label: 'Híbrido GT + vuelo',
    description: 'Volante y HOTAS lateral con soportes desmontables.',
    values: {
      length: 150,
      width: 66,
      seatZ: 40,
      seatH: 34,
      recline: 20,
      wheelZ: 76,
      wheelH: 70,
      wheelTilt: 15,
      pedalZ: 120,
      pedalH: 18,
      pedalTilt: 15,
      wheel: true,
      hotas: true,
      centerStick: false,
      shifter: true,
      handbrake: true,
      hotasZ: 55,
      hotasH: 57,
      hotasOut: 16,
      stickZ: 68,
      stickH: 48,
    },
  },
  small: {
    label: 'Espacio mínimo',
    description: 'Base de 130 cm; sin mandos laterales para entrar mejor.',
    values: {
      length: 130,
      width: 60,
      seatZ: 35,
      seatH: 32,
      recline: 22,
      wheelZ: 69,
      wheelH: 68,
      wheelTilt: 15,
      pedalZ: 111,
      pedalH: 19,
      pedalTilt: 15,
      wheel: true,
      hotas: false,
      centerStick: false,
      shifter: false,
      handbrake: false,
      hotasZ: 50,
      hotasH: 53,
      hotasOut: 12,
      stickZ: 63,
      stickH: 48,
    },
  },
};

const BOOLEAN_SETTINGS = [
  'wheel',
  'hotas',
  'centerStick',
  'shifter',
  'handbrake',
  'roomEnabled',
  'roomFullWalls',
  'deskEnabled',
  'cockpitEnabled',
  'monitorEnabled',
  'keyboardEnabled',
  'pcEnabled',
  'mouseEnabled',
  'matEnabled',
] as const;

const CHOICE_SETTINGS = {
  feet: ['level', 'casters'],
  drivingSide: ['right', 'left'],
  monitorMode: ['cockpit', 'desk', 'vr', 'manual'],
  armBend: ['positive', 'negative'],
  clampMount: ['clamp', 'grommet'],
  clampSide: ['xmin', 'xmax', 'zmin', 'zmax'],
  preset: Object.keys(presets),
} satisfies { [K in keyof CockpitConfig]?: readonly CockpitConfig[K][] | string[] };

type ChoiceSetting = keyof typeof CHOICE_SETTINGS;

/**
 * Validates a saved configuration. Missing settings take their defaults, numbers are clamped
 * to their range, and a value of the wrong type is rejected.
 */
export function sanitize(input: unknown): CockpitConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Configuración inválida');
  const raw = input as Record<string, unknown>;
  const s: CockpitConfig = { ...defaults };
  // Preserve earlier configurations whose desktop position was implicit.
  if (!('deskX' in raw))
    s.deskX =
      (typeof raw.width === 'number' ? clamp(raw.width, 58, 80) : defaults.width) / 2 +
      (typeof raw.deskGap === 'number' ? clamp(raw.deskGap, 0, 80) : defaults.deskGap) +
      40;
  for (const key of Object.keys(fields) as NumericField[]) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Valor inválido: ${key}`);
    const [min, max] = fields[key];
    s[key] = clamp(value, min, max);
  }
  for (const key of BOOLEAN_SETTINGS)
    if (key in raw) {
      const value = raw[key];
      if (typeof value !== 'boolean') throw new Error('Opción inválida');
      s[key] = value;
    }
  for (const key of Object.keys(CHOICE_SETTINGS) as ChoiceSetting[]) {
    const allowed: readonly unknown[] = CHOICE_SETTINGS[key];
    // The value is one of the allowed literals, so the assignment keeps the setting's type.
    if (allowed.includes(raw[key])) (s as Record<ChoiceSetting, unknown>)[key] = raw[key];
  }
  return normalizeRoom(s, raw);
}
