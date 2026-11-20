// Room settings: ranges, defaults and validation of saved data. Lengths in cm.
import { clamp } from '../shared/geometry.ts';
import { normalizeRoom, type FurnitureItem, type RoomFeature } from './room.ts';
import { readArmPoses, type ArmPose } from './arm-poses.ts';

/** Allowed range of a numeric setting: [min, max, step]. */
export type FieldRange = readonly [min: number, max: number, step: number];

// Coordinate system in cm: X lateral, Y up from the floor, Z forward.
export const fields = {
  deskWidth: [120, 200, 5],
  deskDepth: [60, 80, 5],
  deskH: [66, 131, 0.5],
  deskGap: [0, 80, 1],
  deskX: [-1500, 1500, 1],
  deskZ: [-1500, 1500, 1],
  deskAngle: [0, 355, 5],
  armFirstSegment: [10, 100, 0.5],
  armSecondSegment: [10, 100, 0.5],
  armBaseAngle: [-180, 180, 0.1],
  armElbowAngle: [-180, 180, 0.1],
  monitorYaw: [-180, 180, 0.1],
  clampX: [-34, 34, 0.1],
  clampZ: [-94, 94, 0.1],
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

export type MonitorMode = 'desk' | 'vr' | 'manual';
export type ArmBend = 'positive' | 'negative';
export type ClampMount = 'clamp' | 'grommet';
export type ClampSide = 'xmin' | 'xmax' | 'zmin' | 'zmax';

/** The settings of a room and its layouts, as saved in project files (lengths in cm). */
export interface RoomConfig extends Record<NumericField, number> {
  deskEnabled: boolean;
  monitorEnabled: boolean;
  keyboardEnabled: boolean;
  pcEnabled: boolean;
  mouseEnabled: boolean;
  matEnabled: boolean;
  armBend: ArmBend;
  clampMount: ClampMount;
  clampSide: ClampSide;
  monitorMode: MonitorMode;
  /** Named arm positions saved by the user; each layout keeps its own. */
  armPoses: ArmPose[];
  roomEnabled: boolean;
  roomFullWalls: boolean;
  roomFeatures: RoomFeature[];
  roomFurniture: FurnitureItem[];
}

export const defaults: RoomConfig = {
  deskEnabled: true,
  monitorEnabled: true,
  keyboardEnabled: true,
  pcEnabled: true,
  mouseEnabled: true,
  matEnabled: true,
  deskWidth: 140,
  deskDepth: 80,
  deskH: 75,
  deskGap: 30,
  deskX: 102,
  deskZ: 95,
  deskAngle: 0,
  armFirstSegment: 42.5,
  armSecondSegment: 42.5,
  armBaseAngle: 0,
  armElbowAngle: 0,
  monitorYaw: 90,
  armBend: 'positive',
  clampX: -34,
  clampZ: -15,
  clampMount: 'clamp',
  clampSide: 'xmin',
  monitorH: 108,
  monitorInches: 34,
  armMinH: 5,
  armMaxH: 55,
  monitorMode: 'desk',
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
  armPoses: [],
  aisle: 60,
};

const BOOLEAN_SETTINGS = [
  'roomEnabled',
  'roomFullWalls',
  'deskEnabled',
  'monitorEnabled',
  'keyboardEnabled',
  'pcEnabled',
  'mouseEnabled',
  'matEnabled',
] as const;

const CHOICE_SETTINGS = {
  monitorMode: ['desk', 'vr', 'manual'],
  armBend: ['positive', 'negative'],
  clampMount: ['clamp', 'grommet'],
  clampSide: ['xmin', 'xmax', 'zmin', 'zmax'],
} satisfies { [K in keyof RoomConfig]?: readonly RoomConfig[K][] };

type ChoiceSetting = keyof typeof CHOICE_SETTINGS;

/**
 * The chassis width of the retired parametric cockpit, which the oldest files used to place the
 * desk beside it.
 */
const EARLIEST_CHASSIS_WIDTH_CM = { min: 58, max: 80, defaultCm: 64 };
/** How far those files put the desk's center from the edge of its gap to the chassis. */
const DESK_CENTER_FROM_EDGE_CM = 40;

/**
 * Earlier files gave the arm a total length and the first segment's share of it in percent,
 * with these ranges and defaults.
 */
const EARLIER_ARM_REACH_CM = { min: 40, max: 120, defaultCm: 85 };
const EARLIER_ARM_SPLIT_PERCENT = { min: 20, max: 80, defaultPercent: 50 };

/** The values a choice setting accepts, or undefined when `key` is not a choice setting. */
export const choiceOptions = (key: string): readonly string[] | undefined =>
  Object.hasOwn(CHOICE_SETTINGS, key) ? CHOICE_SETTINGS[key as ChoiceSetting] : undefined;

function earlierNumber(raw: Record<string, unknown>, key: string, fallback: number): number {
  if (!(key in raw)) return fallback;
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Invalid value: ${key}`);
  return value;
}

/** The segments of an arm saved as a total length and a split, before each had its own length. */
function earlierArmSegments(raw: Record<string, unknown>): [first: number, second: number] {
  const reach = EARLIER_ARM_REACH_CM;
  const split = EARLIER_ARM_SPLIT_PERCENT;
  const reachCm = clamp(earlierNumber(raw, 'armReach', reach.defaultCm), reach.min, reach.max);
  const splitPercent = clamp(
    earlierNumber(raw, 'armSplit', split.defaultPercent),
    split.min,
    split.max,
  );
  const firstCm = (reachCm * splitPercent) / 100;
  return [firstCm, reachCm - firstCm];
}

/**
 * Validates a saved configuration. Missing settings take their defaults, numbers are clamped
 * to their range, and a value of the wrong type is rejected.
 */
export function sanitize(input: unknown): RoomConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Invalid configuration');
  const raw = input as Record<string, unknown>;
  const s: RoomConfig = { ...defaults };
  // Earlier configurations put the desk beside the chassis of the retired parametric cockpit.
  if (!('deskX' in raw)) {
    const { min, max, defaultCm } = EARLIEST_CHASSIS_WIDTH_CM;
    const chassisWidth = typeof raw.width === 'number' ? clamp(raw.width, min, max) : defaultCm;
    const [gapMin, gapMax] = fields.deskGap;
    const gap =
      typeof raw.deskGap === 'number' ? clamp(raw.deskGap, gapMin, gapMax) : defaults.deskGap;
    s.deskX = chassisWidth / 2 + gap + DESK_CENTER_FROM_EDGE_CM;
  }
  if (!('armFirstSegment' in raw) && !('armSecondSegment' in raw)) {
    const [firstCm, secondCm] = earlierArmSegments(raw);
    const [firstMin, firstMax] = fields.armFirstSegment;
    const [secondMin, secondMax] = fields.armSecondSegment;
    s.armFirstSegment = clamp(firstCm, firstMin, firstMax);
    s.armSecondSegment = clamp(secondCm, secondMin, secondMax);
  }
  for (const key of Object.keys(fields) as NumericField[]) {
    if (!(key in raw)) continue;
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Invalid value: ${key}`);
    const [min, max] = fields[key];
    s[key] = clamp(value, min, max);
  }
  for (const key of BOOLEAN_SETTINGS)
    if (key in raw) {
      const value = raw[key];
      if (typeof value !== 'boolean') throw new Error('Invalid option');
      s[key] = value;
    }
  for (const key of Object.keys(CHOICE_SETTINGS) as ChoiceSetting[]) {
    const allowed: readonly unknown[] = CHOICE_SETTINGS[key];
    // The value is one of the allowed literals, so the assignment keeps the setting's type.
    if (allowed.includes(raw[key])) (s as Record<ChoiceSetting, unknown>)[key] = raw[key];
  }
  if ('armPoses' in raw) s.armPoses = readArmPoses(raw.armPoses);
  return normalizeRoom(s, raw);
}
