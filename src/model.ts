import {
  clamp,
  round,
  transformPoint,
  inversePoint,
  rectangle,
  overlapDepth,
  polygonDistance,
} from './geometry.ts';
import {
  normalizeRoom,
  evaluateRoom,
  type FurnitureItem,
  type Obstacle,
  type RoomFeature,
} from './room.ts';
import type { Check, CheckLevel } from './checks.ts';
import type { PlanPoint, Placement, Point3 } from './geometry.ts';
import { cmToMm, roundMm, type Mm } from './units.ts';

const rad = (degrees: number): number => (degrees * Math.PI) / 180;

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
export { clamp, round, transformPoint, inversePoint, rectangle, overlapDepth, polygonDistance };
/** A point in the cockpit's side (sagittal) plane: Z forward, Y up. */
export interface SidePoint {
  z: number;
  y: number;
}

export const dist = (a: SidePoint, b: SidePoint): number => Math.hypot(a.z - b.z, a.y - b.y);
// Alturas guardadas respecto al cockpit original; la interfaz muestra alturas desde suelo.
export const rigHeightKeys = ['seatH', 'wheelH', 'pedalH', 'hotasH', 'stickH'] as const;
export type RigHeightKey = (typeof rigHeightKeys)[number];
const isRigHeightKey = (key: string): key is RigHeightKey =>
  (rigHeightKeys as readonly string[]).includes(key);

export const rigLift = (s: Partial<Pick<CockpitConfig, 'baseLift'>>): number => s.baseLift ?? 0;
export const floorHeight = (s: CockpitConfig, key: RigHeightKey): number => s[key] + rigLift(s);
export function setRigHeight(s: CockpitConfig, key: RigHeightKey, value: number): CockpitConfig {
  return { ...s, [key]: value - rigLift(s) };
}
// Cuatro prolongaciones entre los apoyos originales (Y=6) y la cara inferior del chasis.
// Las piezas se definen aquí y alimentan escena, envolventes y lista de cortes.
export interface BaseSupport {
  x: number;
  y: number;
  z: number;
  length: number;
  profile: string;
}

export function baseSupports(s: CockpitConfig): BaseSupport[] {
  const length = rigLift(s);
  if (s.cockpitEnabled === false || length <= 0) return [];
  return [-s.width / 2 + 2, s.width / 2 - 2].flatMap((x) =>
    [10, s.length - 10].map((z) => ({ x, z, y: 6 + length / 2, length, profile: '40 × 40' })),
  );
}
export function pose(s: CockpitConfig, target: 'desk' | 'cockpit'): Placement {
  return target === 'desk'
    ? { x: s.deskX, z: s.deskZ, angle: s.deskAngle }
    : { x: s.cockpitX, z: s.cockpitZ, angle: s.cockpitAngle };
}
export function layoutPreset(s: CockpitConfig, name: 'left' | 'front' | 'right'): CockpitConfig {
  const c = pose(s, 'cockpit'),
    offset = s.width / 2 + s.hotasOut + 9 + (s.deskDepth ?? 80) / 2 + 6;
  const local =
      name === 'left'
        ? { x: -offset, z: 95 }
        : name === 'front'
          ? { x: 0, z: s.length + (s.deskDepth ?? 80) / 2 + 6 }
          : { x: offset, z: 95 },
    p = transformPoint(local, c);
  return {
    ...s,
    deskX: round(p.x),
    deskZ: round(p.z),
    deskAngle: (c.angle + (name === 'left' ? 180 : name === 'front' ? 270 : 0)) % 360,
  };
}
// Forward is +Z and up is +Y: the seated driver's right is -X.
export function drivingMount(s: CockpitConfig) {
  const sign = s.drivingSide === 'left' ? 1 : -1;
  return { sign, x: sign * (s.width / 2 + s.hotasOut), z: s.hotasZ - 7 };
}
export type DesktopItemId = 'arm' | 'keyboard' | 'pc' | 'mouse' | 'mat';
type DesktopPrefix = 'clamp' | 'keyboard' | 'pc' | 'mouse' | 'mat';

export interface DesktopTarget {
  id: DesktopItemId;
  label: string;
  /** Prefix of the item's position settings: `<prefix>X` and `<prefix>Z`. */
  prefix: DesktopPrefix;
}

export const desktopTargets: DesktopTarget[] = [
  { id: 'arm', label: 'Anclaje del brazo', prefix: 'clamp' },
  { id: 'keyboard', label: 'Teclado', prefix: 'keyboard' },
  { id: 'pc', label: 'PC / torre', prefix: 'pc' },
  { id: 'mouse', label: 'Ratón', prefix: 'mouse' },
  { id: 'mat', label: 'Alfombrilla XL', prefix: 'mat' },
];
export function deskBounds(s: Partial<Pick<CockpitConfig, 'deskWidth' | 'deskDepth'>>) {
  const width = s.deskWidth ?? defaults.deskWidth,
    depth = s.deskDepth ?? defaults.deskDepth,
    halfX = depth / 2,
    halfZ = width / 2,
    frameWidth = clamp(width - 20, 110, 190);
  return {
    width,
    depth,
    halfX,
    halfZ,
    anchorX: halfX - 6,
    anchorZ: halfZ - 6,
    footDepth: 66,
    footprintHalfX: Math.max(halfX, 33),
    frameWidth,
    columnZ: frameWidth / 2 - 5,
  };
}
/** Range of a setting for the current configuration: some limits depend on other settings. */
export function fieldSpec(key: NumericField, s: CockpitConfig): FieldRange {
  const b = deskBounds(s);
  if (isRigHeightKey(key)) {
    const [min, max, step] = fields[key];
    return [min + rigLift(s), max + rigLift(s), step];
  }
  if (key === 'clampX') return [-b.anchorX, b.anchorX, 0.1];
  if (key === 'clampZ') return [-b.anchorZ, b.anchorZ, 0.1];
  if (/^(keyboard|pc|mouse|mat)X$/.test(key)) return [-b.halfX, b.halfX, 0.1];
  if (/^(keyboard|pc|mouse|mat)Z$/.test(key)) return [-b.halfZ, b.halfZ, 0.1];
  return fields[key];
}
/** The desk edge closest to the arm's anchor, keeping the current side on ties. */
export function clampEdge(s: CockpitConfig): ClampSide {
  const b = deskBounds(s),
    candidates: [ClampSide, number][] = [
      ['xmin', Math.abs(s.clampX + b.anchorX)],
      ['xmax', Math.abs(s.clampX - b.anchorX)],
      ['zmin', Math.abs(s.clampZ + b.anchorZ)],
      ['zmax', Math.abs(s.clampZ - b.anchorZ)],
    ];
  return candidates.sort((a, b) =>
    Math.abs(a[1] - b[1]) < 0.001
      ? a[0] === s.clampSide
        ? -1
        : b[0] === s.clampSide
          ? 1
          : 0
      : a[1] - b[1],
  )[0][0];
}
const enabledKey = (id: DesktopItemId) =>
  id === 'arm' ? 'monitorEnabled' : (`${id}Enabled` as const);
const angleOf = (s: CockpitConfig, prefix: DesktopPrefix): number =>
  prefix === 'clamp' ? 0 : (s[`${prefix}Angle`] ?? 0);

export function getDesktopItems(s: CockpitConfig, { includeInactive = false } = {}) {
  const bounds = deskBounds(s),
    sizes: Record<DesktopItemId, [sizeX: number, sizeZ: number, height: number]> = {
      arm: [8, 8, 3],
      keyboard: [s.keyboardDepth, s.keyboardWidth, 2.2],
      pc: [s.pcWidth, s.pcDepth, s.pcHeight],
      mouse: [12, 7, 3.5],
      mat: [s.matDepth, s.matWidth, 0.35],
    };
  return desktopTargets
    .filter(
      (target) =>
        includeInactive || (s.deskEnabled !== false && s[enabledKey(target.id)] !== false),
    )
    .map((target) => {
      const [sizeX, sizeZ, height] = sizes[target.id],
        local = {
          x: s[`${target.prefix}X`],
          z: s[`${target.prefix}Z`],
          angle: angleOf(s, target.prefix),
        },
        localPolygon = rectangle(-sizeX / 2, sizeX / 2, -sizeZ / 2, sizeZ / 2, local),
        world = transformPoint(local, pose(s, 'desk')),
        polygon = localPolygon.map((p) => transformPoint(p, pose(s, 'desk'))),
        outside = localPolygon.some(
          (p) => Math.abs(p.x) > bounds.halfX + 0.01 || Math.abs(p.z) > bounds.halfZ + 0.01,
        );
      return { ...target, sizeX, sizeZ, height, local, localPolygon, world, polygon, outside };
    });
}
export function placeDeskItem(
  s: CockpitConfig,
  id: DesktopItemId,
  x: number,
  z: number,
): CockpitConfig {
  const target = desktopTargets.find((t) => t.id === id);
  if (!target) return s;
  const result = { ...s },
    b = deskBounds(s);
  if (id === 'arm') {
    result.clampX = round(clamp(x, -b.anchorX, b.anchorX));
    result.clampZ = round(clamp(z, -b.anchorZ, b.anchorZ));
    if (s.clampMount === 'clamp') {
      const edge = clampEdge(result);
      result.clampSide = edge;
      if (edge === 'xmin') result.clampX = -b.anchorX;
      if (edge === 'xmax') result.clampX = b.anchorX;
      if (edge === 'zmin') result.clampZ = -b.anchorZ;
      if (edge === 'zmax') result.clampZ = b.anchorZ;
    }
    return result;
  }
  const item = getDesktopItems(s, { includeInactive: true }).find((t) => t.id === id);
  if (!item) return s;
  const angle = rad(item.local.angle),
    halfX =
      (Math.abs(Math.cos(angle)) * item.sizeX) / 2 + (Math.abs(Math.sin(angle)) * item.sizeZ) / 2,
    halfZ =
      (Math.abs(Math.sin(angle)) * item.sizeX) / 2 + (Math.abs(Math.cos(angle)) * item.sizeZ) / 2;
  const limitX = Math.floor(Math.max(0, b.halfX - halfX) * 10 + 1e-7) / 10,
    limitZ = Math.floor(Math.max(0, b.halfZ - halfZ) * 10 + 1e-7) / 10;
  result[`${target.prefix}X`] = round(clamp(x, -limitX, limitX));
  result[`${target.prefix}Z`] = round(clamp(z, -limitZ, limitZ));
  return result;
}
export function resizeDesk(s: CockpitConfig, width: number, depth: number): CockpitConfig {
  const side = clampEdge(s);
  let next = { ...s, deskWidth: clamp(width, 120, 200), deskDepth: clamp(depth, 60, 80) };
  const b = deskBounds(next);
  next.clampX = clamp(s.clampX, -b.anchorX, b.anchorX);
  next.clampZ = clamp(s.clampZ, -b.anchorZ, b.anchorZ);
  if (next.clampMount === 'clamp') {
    next.clampSide = side;
    if (side === 'xmin') next.clampX = -b.anchorX;
    if (side === 'xmax') next.clampX = b.anchorX;
    if (side === 'zmin') next.clampZ = -b.anchorZ;
    if (side === 'zmax') next.clampZ = b.anchorZ;
  }
  for (const item of desktopTargets.filter((t) => t.id !== 'arm'))
    next = placeDeskItem(next, item.id, next[`${item.prefix}X`], next[`${item.prefix}Z`]);
  return next;
}
export function updateDeskItem(s: CockpitConfig, key: NumericField, value: number): CockpitConfig {
  if (key === 'deskWidth' || key === 'deskDepth')
    return resizeDesk(
      s,
      key === 'deskWidth' ? value : s.deskWidth,
      key === 'deskDepth' ? value : s.deskDepth,
    );
  const next: CockpitConfig = { ...s, [key]: value },
    target = desktopTargets.find((t) => key.startsWith(t.prefix));
  return target
    ? placeDeskItem(next, target.id, next[`${target.prefix}X`], next[`${target.prefix}Z`])
    : next;
}
// Planar two-link monitor arm. Angles follow the desk's Y rotation convention.
/** Wraps an angle in degrees to [-180, 180). */
export const wrapAngle = (angle: number): number => ((((angle + 180) % 360) + 360) % 360) - 180;

export function armKinematics(
  s: CockpitConfig,
  anchor: PlanPoint,
  target: PlanPoint | null = null,
) {
  const first = (s.armReach * (s.armSplit ?? 50)) / 100,
    second = s.armReach - first,
    minReach = Math.abs(first - second),
    maxReach = first + second;
  let baseAngle = s.armBaseAngle ?? 0,
    elbowAngle = s.armElbowAngle ?? 0,
    reachable = true;
  if (target) {
    const dx = target.x - anchor.x,
      dz = target.z - anchor.z,
      d = Math.hypot(dx, dz),
      safe = clamp(d, minReach, maxReach);
    reachable = d >= minReach - 1e-7 && d <= maxReach + 1e-7;
    const bend = s.armBend === 'negative' ? -1 : 1,
      theta =
        bend *
        Math.acos(
          clamp((safe * safe - first * first - second * second) / (2 * first * second), -1, 1),
        );
    const heading = d > 1e-8 ? Math.atan2(-dz, dx) : rad(s.deskAngle + baseAngle);
    baseAngle = wrapAngle(
      ((heading - Math.atan2(second * Math.sin(theta), first + second * Math.cos(theta))) /
        Math.PI) *
        180 -
        s.deskAngle,
    );
    elbowAngle = (theta / Math.PI) * 180;
  }
  const a = rad(s.deskAngle + baseAngle),
    b = a + rad(elbowAngle),
    y = s.monitorH;
  const base = { x: anchor.x, y, z: anchor.z },
    elbow = { x: base.x + first * Math.cos(a), y, z: base.z - first * Math.sin(a) },
    end = { x: elbow.x + second * Math.cos(b), y, z: elbow.z - second * Math.sin(b) };
  return { base, elbow, end, first, second, minReach, maxReach, baseAngle, elbowAngle, reachable };
}
export function monitorGeometry(s: CockpitConfig) {
  const anchor = transformPoint({ x: s.clampX, z: s.clampZ, y: s.deskH }, pose(s, 'desk'));
  const mode = s.cockpitEnabled === false && s.monitorMode === 'cockpit' ? 'desk' : s.monitorMode;
  const target =
    mode === 'manual'
      ? null
      : mode === 'cockpit'
        ? transformPoint({ x: 0, z: s.wheelZ + s.monitorAhead, y: s.monitorH }, pose(s, 'cockpit'))
        : transformPoint({ x: -10, z: 0, y: s.monitorH }, pose(s, 'desk'));
  const arm = armKinematics(s, anchor, target),
    point = target ?? arm.end,
    angle =
      mode === 'manual'
        ? s.deskAngle + s.monitorYaw
        : mode === 'cockpit'
          ? s.cockpitAngle
          : s.deskAngle + 90;
  return { anchor, arm, point, angle };
}
export function setMonitorMode(s: CockpitConfig, mode: MonitorMode): CockpitConfig {
  if (mode !== 'manual' || s.monitorMode === 'manual') return { ...s, monitorMode: mode };
  const g = monitorGeometry(s);
  return {
    ...s,
    monitorMode: 'manual',
    armBaseAngle: g.arm.baseAngle,
    armElbowAngle: g.arm.elbowAngle,
    monitorYaw: wrapAngle(g.angle - s.deskAngle),
  };
}
/** Edits one arm setting. Changing an angle by hand switches the monitor to manual mode. */
export function editArm(s: CockpitConfig, key: string, value: unknown): CockpitConfig {
  if (key === 'monitorMode') return setMonitorMode(s, value as MonitorMode);
  if (key === 'armBend') {
    const next = { ...s, armBend: value as ArmBend };
    if (next.monitorMode === 'manual')
      next.armElbowAngle = Math.abs(next.armElbowAngle) * (value === 'negative' ? -1 : 1);
    return next;
  }
  if (key !== 'armBaseAngle' && key !== 'armElbowAngle' && key !== 'monitorYaw') return s;
  const angle = value as number;
  const next = setMonitorMode(s, 'manual');
  next[key] = angle;
  if (key === 'armElbowAngle') next.armBend = angle < 0 ? 'negative' : 'positive';
  return next;
}
export function moveArmJoint(
  s: CockpitConfig,
  joint: 'elbow' | 'end',
  x: number,
  z: number,
): CockpitConfig {
  const next = setMonitorMode(s, 'manual'),
    g = monitorGeometry(next);
  if (joint === 'elbow') {
    next.armBaseAngle = wrapAngle(
      (Math.atan2(g.anchor.z - z, x - g.anchor.x) * 180) / Math.PI - s.deskAngle,
    );
  } else {
    const arm = armKinematics(next, g.anchor, { x, z });
    next.armBaseAngle = arm.baseAngle;
    next.armElbowAngle = arm.elbowAngle;
  }
  return next;
}
/** Two-link joint between a and b with link lengths l1 and l2; branch picks the bend side. */
export function solveJoint(a: SidePoint, b: SidePoint, l1: number, l2: number, branch = 1) {
  const d = dist(a, b),
    reachable = d <= l1 + l2 && d >= Math.abs(l1 - l2) && d > 0.001;
  const safeD = clamp(d, Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
  const t = Math.atan2(b.y - a.y, b.z - a.z),
    phi = Math.acos(clamp((l1 * l1 + safeD * safeD - l2 * l2) / (2 * l1 * safeD), -1, 1));
  const joint = {
    z: a.z + l1 * Math.cos(t + branch * phi),
    y: a.y + l1 * Math.sin(t + branch * phi),
  };
  const angle =
    (Math.acos(clamp((l1 * l1 + l2 * l2 - safeD * safeD) / (2 * l1 * l2), -1, 1)) * 180) / Math.PI;
  return { joint, reachable, angle, d };
}
export function anatomy(s: CockpitConfig) {
  const h = s.height,
    a = rad(s.recline),
    hip = { z: s.seatZ, y: s.seatH + 4 },
    shoulder = { z: hip.z - Math.sin(a) * h * 0.288, y: hip.y + Math.cos(a) * h * 0.288 };
  const eye = { z: hip.z - Math.sin(a) * h * 0.39, y: hip.y + Math.cos(a) * h * 0.39 };
  const foot = { z: s.pedalZ - 5, y: s.pedalH + 8 };
  const hand = { z: s.wheelZ - 2, y: s.wheelH + 1 };
  const legs = solveJoint(hip, foot, h * 0.245, h * 0.246),
    arms = solveJoint(shoulder, hand, h * 0.186, h * 0.146, -1);
  // Torso to thigh included angle in the sagittal plane.
  const v1 = { z: shoulder.z - hip.z, y: shoulder.y - hip.y },
    v2 = { z: legs.joint.z - hip.z, y: legs.joint.y - hip.y };
  const hipAngle =
    (Math.acos(
      clamp((v1.z * v2.z + v1.y * v2.y) / (Math.hypot(v1.z, v1.y) * Math.hypot(v2.z, v2.y)), -1, 1),
    ) *
      180) /
    Math.PI;
  return { hip, shoulder, eye, foot, hand, legs, arms, hipAngle };
}
export interface Accessory {
  name: string;
  qty: number;
  note: string;
}

export interface ProfilePart {
  name: string;
  profile: string;
  qty: number;
  /** Net length of one piece. */
  mm: Mm;
  /** Total length of all pieces. */
  total: Mm;
}

function desktopAccessories(s: CockpitConfig): Accessory[] {
  if (s.deskEnabled === false) return [];
  const items: Accessory[] = [];
  if (s.matEnabled !== false)
    items.push({
      name: 'Alfombrilla XL',
      qty: 1,
      note: `${s.matWidth} × ${s.matDepth} cm; escritorio`,
    });
  if (s.monitorEnabled !== false)
    items.push({
      name: 'Brazo monitor para mesa',
      qty: 1,
      note: `Alcance declarado ≥ ${s.armReach} cm; VESA y carga por verificar`,
    });
  return items;
}
export interface PartsList {
  parts: ProfilePart[];
  accessories: Accessory[];
  totalMm: number;
  cuts: number;
  joints: number;
}

export function getParts(s: CockpitConfig): PartsList {
  if (s.cockpitEnabled === false)
    return { parts: [], accessories: desktopAccessories(s), totalMm: 0, cuts: 0, joints: 0 };
  const b = s.width - 8,
    wh = s.wheelH - 22,
    seatPost = Math.max(4, s.seatH - 18),
    parts: ProfilePart[] = [];
  const add = (name: string, profile: string, qty: number, lengthCm: number) => {
    const mm = roundMm(cmToMm(lengthCm));
    parts.push({ name, profile, qty, mm, total: (mm * qty) as Mm });
  };
  add('Largueros de base', '40 × 80', 2, s.length);
  add('Travesaños de base', '40 × 80', 3, b);
  const supports = baseSupports(s);
  if (supports.length)
    add('Prolongaciones de base', supports[0].profile, supports.length, supports[0].length);
  add('Travesaños de asiento', '40 × 40', 2, b);
  add('Apoyos de asiento', '40 × 40', 4, seatPost);
  add('Largueros de pedalera', '40 × 40', 2, 38);
  add('Travesaños de pedalera', '40 × 40', 2, b);
  add('Apoyos de pedalera', '40 × 40', 2, Math.max(4, s.pedalH - 10));
  if (s.wheel) {
    add('Montantes de volante', '40 × 80', 2, wh);
    add('Travesaño de volante', '40 × 80', 1, b);
  }
  if (s.hotas) {
    add('Montantes HOTAS', '40 × 40', 2, s.hotasH - 13);
    add('Brazos HOTAS', '40 × 40', 2, s.hotasOut + 12);
  }
  if (s.centerStick) {
    add('Montante joystick central', '40 × 40', 1, s.stickH - 10);
    add('Brazo joystick central', '40 × 40', 1, 24);
  }
  if (s.shifter || s.handbrake) {
    add('Montante cambio / freno', '40 × 40', 1, s.hotasH - 13);
    add('Brazo cambio / freno', '40 × 40', 1, 30);
  }
  const joints =
    14 +
    (s.wheel ? 6 : 0) +
    (s.hotas ? 8 : 0) +
    (s.centerStick ? 4 : 0) +
    (s.shifter || s.handbrake ? 4 : 0);
  const accessories = [
    {
      name: 'Escuadras reforzadas serie 40',
      qty: joints,
      note: 'Estimación de 2 tornillos por escuadra',
    },
    {
      name: 'Tuercas T + tornillos M8',
      qty: joints * 2 + 24,
      note: 'Ranura y longitud a confirmar con el proveedor',
    },
    {
      name: s.feet === 'casters' ? 'Ruedas con freno + adaptador' : 'Pies niveladores + adaptador',
      qty: 4,
      note: 'Capacidad de carga a dimensionar',
    },
    {
      name: 'Tapas de perfil',
      qty: parts.reduce((a, p) => a + p.qty * 2, 0),
      note: 'Máximo teórico; descontar extremos unidos',
    },
    {
      name: 'Asiento manual de coche + raíles',
      qty: 1,
      note: 'Envolvente de asiento: 50 × 65 cm aprox.',
    },
    {
      name: 'Placa pedalera regulable',
      qty: 1,
      note: `${Math.round(b * 10)} × 380 mm; patrón según pedalera`,
    },
  ];
  if (s.wheel)
    accessories.push({
      name: 'Placa de volante regulable',
      qty: 1,
      note: `${Math.round(b * 10)} × 220 mm; patrón de la base real`,
    });
  if (s.hotas)
    accessories.push({
      name: 'Placas HOTAS desmontables',
      qty: 2,
      note: '180 × 250 mm; taladrado según mandos',
    });
  if (s.centerStick)
    accessories.push({
      name: 'Placa joystick central',
      qty: 1,
      note: '180 × 200 mm; montaje desmontable',
    });
  if (s.shifter || s.handbrake)
    accessories.push({
      name: 'Placa cambio / freno de mano',
      qty: 1,
      note: '200 × 300 mm; patrones por verificar',
    });
  accessories.push(...desktopAccessories(s));
  return {
    parts,
    accessories,
    totalMm: parts.reduce((a, p) => a + p.total, 0),
    cuts: parts.reduce((a, p) => a + p.qty, 0),
    joints,
  };
}
export function evaluate(s: CockpitConfig) {
  const hasRig = s.cockpitEnabled !== false,
    hasDesk = s.deskEnabled !== false,
    hasMonitor = hasDesk && s.monitorEnabled !== false;
  const body = anatomy(s),
    hasDriving = hasRig && (s.shifter || s.handbrake),
    driving = drivingMount(s),
    rigPose = pose(s, 'cockpit'),
    deskPose = pose(s, 'desk');
  const flightExtra = s.hotas ? s.hotasOut + 9 : 0,
    drivingExtra = hasDriving ? s.hotasOut + 10 : 0;
  const rigLeft = -s.width / 2 - Math.max(flightExtra, driving.sign < 0 ? drivingExtra : 0),
    rigRight = s.width / 2 + Math.max(flightExtra, driving.sign > 0 ? drivingExtra : 0);
  const bounds = deskBounds(s),
    deskLeft = -bounds.halfX,
    deskRight = bounds.halfX,
    deskBack = -bounds.halfZ,
    deskFront = bounds.halfZ;
  const monitorW = (s.monitorInches * 2.54 * 21) / Math.hypot(21, 9),
    monitorH = (s.monitorInches * 2.54 * 9) / Math.hypot(21, 9);
  const monitor = monitorGeometry(s),
    clampPoint = monitor.anchor,
    monitorPoint = monitor.point,
    monitorAngle = monitor.angle,
    armPose = monitor.arm;
  const reach = Math.hypot(clampPoint.x - monitorPoint.x, clampPoint.z - monitorPoint.z),
    lift = s.monitorH - s.deskH;
  const pedalEnd = s.pedalZ + 18 * Math.cos(rad(s.pedalTilt)),
    overhang = pedalEnd > s.length;
  const seatBackZ = s.seatZ - 12 - Math.sin(rad(s.recline)) * 64 - Math.cos(rad(s.recline)) * 4.5;
  const lowerZ = Math.min(0, seatBackZ),
    upperZ = Math.max(s.length, pedalEnd, s.wheel ? s.wheelZ + 32 : 0);
  const rigPolygon = hasRig ? rectangle(rigLeft, rigRight, lowerZ, upperZ, rigPose) : [],
    deskPolygon = hasDesk
      ? rectangle(-bounds.footprintHalfX, bounds.footprintHalfX, deskBack, deskFront, deskPose)
      : [],
    tabletopPolygon = hasDesk ? rectangle(deskLeft, deskRight, deskBack, deskFront, deskPose) : [],
    monitorPolygon = hasMonitor
      ? rectangle(-monitorW / 2, monitorW / 2, -2, 2, { ...monitorPoint, angle: monitorAngle })
      : [];
  const desktopItems = getDesktopItems(s);
  const setupPoints = [
    ...rigPolygon,
    ...deskPolygon,
    ...monitorPolygon,
    ...desktopItems.flatMap((item) => item.polygon),
    ...(hasMonitor ? [armPose.elbow, armPose.end] : []),
  ];
  const allPoints = setupPoints.length ? setupPoints : [{ x: s.roomX, z: s.roomZ }],
    allLeft = Math.min(...allPoints.map((p) => p.x)),
    allRight = Math.max(...allPoints.map((p) => p.x)),
    allBack = Math.min(...allPoints.map((p) => p.z)),
    allFront = Math.max(...allPoints.map((p) => p.z));
  const spaceW = allRight - allLeft,
    spaceD = allFront - allBack,
    freeW = s.roomW - spaceW,
    freeD = s.roomD - spaceD;
  const roomBounds = {
    left: s.roomX,
    right: s.roomX + s.roomW,
    back: s.roomZ,
    front: s.roomZ + s.roomD,
  };
  const clearances = {
    left: allLeft - roomBounds.left,
    right: roomBounds.right - allRight,
    back: allBack - roomBounds.back,
    front: roomBounds.front - allFront,
  };
  const roomFits = Object.values(clearances).every((gap) => gap >= -0.01);
  const sideGap = hasRig && hasDesk ? polygonDistance(rigPolygon, deskPolygon) : 0;
  const solid = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    placement: Placement,
  ) => ({
    polygon: rectangle(x0, x1, z0, z1, placement),
    y0,
    y1,
  });
  const rigSolids = hasRig
    ? [
        solid(-s.width / 2, s.width / 2, 0, s.length, 6, 14, rigPose),
        solid(-25, 25, seatBackZ, s.seatZ + 25, s.seatH - 8, s.seatH + 64, rigPose),
        solid(
          -s.width / 2 + 4,
          s.width / 2 - 4,
          s.pedalZ - 19,
          s.pedalZ + 19,
          s.pedalH - 5,
          s.pedalH + 24,
          rigPose,
        ),
      ]
    : [];
  if (hasRig && s.wheel) {
    rigSolids.push(
      solid(-16, 16, s.wheelZ - 3, s.wheelZ + 32, s.wheelH - 10, s.wheelH + 16, rigPose),
    );
    for (const sign of [-1, 1]) {
      const x = sign * (s.width / 2 - 2);
      rigSolids.push(solid(x - 4, x + 4, s.wheelZ + 15, s.wheelZ + 21, 14, s.wheelH - 8, rigPose));
    }
  }
  if (hasRig && s.hotas)
    for (const sign of [-1, 1]) {
      const x = sign * (s.width / 2 + s.hotasOut),
        z = s.hotasZ + (sign === driving.sign && hasDriving ? 24 : 0);
      rigSolids.push(solid(x - 9, x + 9, z - 12.5, z + 12.5, s.hotasH - 4, s.hotasH + 22, rigPose));
    }
  if (hasDriving) {
    const { x, z } = driving;
    rigSolids.push(solid(x - 10, x + 10, z - 15, z + 15, s.hotasH - 4, s.hotasH + 25, rigPose));
  }
  if (hasRig && s.centerStick)
    rigSolids.push(
      solid(-9, 9, s.stickZ - 10, s.stickZ + 10, s.stickH - 3, s.stickH + 22, rigPose),
    );
  for (const volume of rigSolids) {
    volume.y0 += rigLift(s);
    volume.y1 += rigLift(s);
  }
  for (const p of baseSupports(s))
    rigSolids.push(
      solid(p.x - 2, p.x + 2, p.z - 2, p.z + 2, p.y - p.length / 2, p.y + p.length / 2, rigPose),
    );
  const deskSolids = hasDesk
    ? [solid(deskLeft, deskRight, deskBack, deskFront, s.deskH - 2.5, s.deskH, deskPose)]
    : [];
  for (const z of hasDesk ? [-bounds.columnZ, bounds.columnZ] : []) {
    deskSolids.push(solid(0, 10, z - 4.5, z + 4.5, 6, s.deskH - 4, deskPose));
    deskSolids.push(solid(-33, 33, z - 4, z + 4, 1, 6, deskPose));
  }
  let collisionCount = 0;
  for (const r of rigSolids)
    for (const d of deskSolids)
      if (
        Math.min(r.y1, d.y1) - Math.max(r.y0, d.y0) > 0.1 &&
        overlapDepth(r.polygon, d.polygon) > 0.1
      )
        collisionCount++;
  const deskCollision = collisionCount > 0;
  const bodyCheck: Check[] = [];
  const check = (
    id: string,
    label: string,
    value: string,
    level: CheckLevel,
    detail: string,
  ): Check => ({ id, label, value, level, detail });
  bodyCheck.push(
    check(
      'knee',
      'Ángulo de rodilla',
      body.legs.reachable ? `${Math.round(body.legs.angle)}°` : 'Sin alcance',
      !body.legs.reachable
        ? 'error'
        : body.legs.angle < 100 || body.legs.angle > 145
          ? 'warning'
          : 'ok',
      'Guía 100–145° · proporciones medias',
    ),
  );
  bodyCheck.push(
    check(
      'hip',
      'Apertura de cadera',
      `${Math.round(body.hipAngle)}°`,
      body.hipAngle < 85 || body.hipAngle > 125 ? 'warning' : 'ok',
      'Guía 85–125° · respaldo incluido',
    ),
  );
  if (s.wheel)
    bodyCheck.push(
      check(
        'elbow',
        'Ángulo de codo',
        body.arms.reachable ? `${Math.round(body.arms.angle)}°` : 'Sin alcance',
        !body.arms.reachable
          ? 'error'
          : body.arms.angle < 85 || body.arms.angle > 140
            ? 'warning'
            : 'ok',
        'Guía 85–140° · agarre lateral',
      ),
    );
  if (s.hotas) {
    const d = Math.hypot(
      s.hotasZ - body.shoulder.z,
      s.hotasH + 18 - body.shoulder.y,
      s.width / 2 + s.hotasOut - 18,
    );
    bodyCheck.push(
      check(
        'hotas',
        'Alcance HOTAS',
        `${Math.round(d)} cm`,
        d > s.height * 0.332 ? 'error' : d > s.height * 0.3 ? 'warning' : 'ok',
        'Hombro a empuñadura · aproximado',
      ),
    );
  }
  if (s.centerStick) {
    const d = Math.hypot(s.stickZ - body.shoulder.z, s.stickH + 14 - body.shoulder.y);
    bodyCheck.push(
      check(
        'stick',
        'Joystick central',
        `${Math.round(d)} cm`,
        d > s.height * 0.332 ? 'error' : 'ok',
        'Hombro a empuñadura · aproximado',
      ),
    );
  }
  if (hasRig && hasMonitor && s.monitorMode === 'cockpit') {
    const eye = transformPoint({ x: 0, ...body.eye, y: body.eye.y + rigLift(s) }, rigPose),
      d = Math.hypot(monitorPoint.x - eye.x, monitorPoint.z - eye.z, monitorPoint.y - eye.y);
    bodyCheck.push(
      check(
        'eyes',
        'Ojos a pantalla',
        `${Math.round(d)} cm`,
        d < 50 || d > 110 ? 'warning' : 'ok',
        'Distancia geométrica · guía 50–110 cm',
      ),
    );
  }
  const spaceCheck = [
    check(
      'side',
      'Separación en planta',
      sideGap < 0 ? `${Math.ceil(-sideGap)} cm de solape` : `${Math.round(sideGap)} cm`,
      sideGap < 5 ? 'warning' : 'ok',
      sideGap < 0
        ? 'Huellas superpuestas; comprueba las alturas'
        : 'Distancia mínima entre huellas giradas',
    ),
  ];
  spaceCheck.push(
    check(
      'collision',
      'Interferencias',
      deskCollision ? `${collisionCount} cruce${collisionCount > 1 ? 's' : ''}` : 'Sin cruce',
      deskCollision ? 'error' : 'ok',
      'Volúmenes aproximados · giro incluido',
    ),
  );

  {
    spaceCheck.push(
      check(
        'arm',
        'Brazo de monitor',
        armPose.reachable ? (s.monitorMode === 'manual' ? 'Manual' : 'Alcanza') : 'No alcanza',
        !armPose.reachable ? 'error' : reach > s.armReach * 0.9 ? 'warning' : 'ok',
        `${Math.round(reach)} cm en planta · rango ${round(armPose.minReach)}–${s.armReach} cm; tramos ${round(armPose.first)} + ${round(armPose.second)} cm`,
      ),
    );
    spaceCheck.push(
      check(
        'lift',
        'Altura del brazo',
        `${Math.round(lift)} cm`,
        lift < s.armMinH || lift > s.armMaxH ? 'error' : 'ok',
        `Centro VESA sobre tablero · ${s.armMinH}–${s.armMaxH} cm`,
      ),
    );
    if (s.monitorMode === 'cockpit') {
      const monitorClearance = s.monitorH - monitorH / 2 - (floorHeight(s, 'wheelH') + 16);
      spaceCheck.push(
        check(
          'screen',
          'Pantalla / volante',
          s.wheel ? `${Math.round(monitorClearance)} cm` : 'Libre',
          s.wheel && monitorClearance < 2 ? 'warning' : 'ok',
          'Separación vertical de envolventes',
        ),
      );
    }
  }
  if (s.monitorMode === 'vr' && hasMonitor)
    spaceCheck.push(
      check('vr', 'Modo VR', 'Frontal libre', 'ok', 'Monitor aparcado sobre la mesa'),
    );
  const outsideItems = desktopItems.filter((item) => item.outside),
    hardItems = desktopItems.filter((item) => item.id !== 'mat'),
    desktopOverlaps: string[] = [];
  for (let i = 0; i < hardItems.length; i++)
    for (let j = i + 1; j < hardItems.length; j++)
      if (overlapDepth(hardItems[i].localPolygon, hardItems[j].localPolygon) > 0.2)
        desktopOverlaps.push(`${hardItems[i].label} / ${hardItems[j].label}`);
  const mat = desktopItems.find((item) => item.id === 'mat'),
    mouse = desktopItems.find((item) => item.id === 'mouse'),
    mouseOnMat =
      !!mat &&
      !!mouse &&
      mouse.localPolygon.every((p) => {
        const local = inversePoint(p, mat.local);
        return (
          Math.abs(local.x) <= mat.sizeX / 2 + 0.01 && Math.abs(local.z) <= mat.sizeZ / 2 + 0.01
        );
      });
  const desktopChecks = [
    check(
      'desktop-fit',
      'Dentro del tablero',
      outsideItems.length ? 'Revisar bordes' : 'Todo dentro',
      outsideItems.length ? 'warning' : 'ok',
      outsideItems.length
        ? outsideItems.map((i) => i.label).join(', ')
        : `Envolventes y giros sobre ${s.deskWidth} × ${s.deskDepth} cm`,
    ),
    check(
      'desktop-overlap',
      'Objetos sobre la mesa',
      desktopOverlaps.length
        ? `${desktopOverlaps.length} solape${desktopOverlaps.length > 1 ? 's' : ''}`
        : 'Sin solapes',
      desktopOverlaps.length ? 'warning' : 'ok',
      desktopOverlaps.length ? desktopOverlaps.join(' · ') : 'La alfombrilla admite objetos encima',
    ),
    check(
      'mouse-mat',
      'Ratón y alfombrilla',
      mouseOnMat ? 'Dentro' : 'Fuera',
      mouseOnMat ? 'ok' : 'warning',
      `${s.matWidth} × ${s.matDepth} cm · cobertura del ratón`,
    ),
  ];
  const edgeDistance = Math.min(
    Math.abs(s.clampX + bounds.anchorX),
    Math.abs(s.clampX - bounds.anchorX),
    Math.abs(s.clampZ + bounds.anchorZ),
    Math.abs(s.clampZ - bounds.anchorZ),
  );
  desktopChecks.push(
    check(
      'mount',
      'Fijación del brazo',
      s.clampMount === 'grommet' ? 'Pasante' : edgeDistance < 0.1 ? 'En borde' : 'Revisar',
      s.clampMount === 'clamp' && edgeDistance >= 0.1 ? 'warning' : 'ok',
      s.clampMount === 'grommet'
        ? 'Requiere taladro o pasacables compatible'
        : 'Mordaza al borde · compatibilidad por comprobar',
    ),
  );

  const segmentSolid = (a: PlanPoint, b: PlanPoint, r: number, y: number) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z),
      angle = (Math.atan2(-(b.z - a.z), b.x - a.x) * 180) / Math.PI;
    return solid(-length / 2, length / 2, -r, r, y - 3, y + 3, {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      angle,
    });
  };
  const roomSolids: Obstacle[] = [
    ...rigSolids.map((v) => ({ ...v, label: 'Cockpit' })),
    ...deskSolids.map((v) => ({ ...v, label: 'Escritorio' })),
    ...desktopItems
      .filter((v) => v.id !== 'mat')
      .map((v) => ({ polygon: v.polygon, y0: s.deskH, y1: s.deskH + v.height, label: v.label })),
    ...(hasMonitor
      ? [
          {
            polygon: monitorPolygon,
            y0: s.monitorH - monitorH / 2,
            y1: s.monitorH + monitorH / 2,
            label: 'Monitor',
          },
          ...[
            [clampPoint, armPose.elbow],
            [armPose.elbow, armPose.end],
          ].map(([a, b]) => ({
            ...segmentSolid(a, b, 1.5, s.monitorH),
            label: 'Brazo de monitor',
          })),
        ]
      : []),
  ];
  const room = evaluateRoom(s, roomSolids),
    bandCandidates = (setupPoints.length ? Object.entries(clearances) : [])
      .filter(([, gap]) => gap >= s.aisle)
      .map(([side]) => ({
        side,
        polygon:
          side === 'left'
            ? rectangle(allLeft - s.aisle, allLeft, allBack, allFront, { x: 0, z: 0, angle: 0 })
            : side === 'right'
              ? rectangle(allRight, allRight + s.aisle, allBack, allFront, { x: 0, z: 0, angle: 0 })
              : side === 'back'
                ? rectangle(allLeft, allRight, allBack - s.aisle, allBack, { x: 0, z: 0, angle: 0 })
                : rectangle(allLeft, allRight, allFront, allFront + s.aisle, {
                    x: 0,
                    z: 0,
                    angle: 0,
                  }),
      }));
  const freeBand = bandCandidates.find(
    (b) =>
      !room.furniture.some((f) => overlapDepth(b.polygon, f.polygon) > 0.1) &&
      !room.features
        .filter((f) => f.type === 'door')
        .some((f) => f.sectors.some((p) => overlapDepth(b.polygon, p) > 0.1)),
  );
  const aisleFits = roomFits && !!freeBand;
  const extra: Check[] = [];
  if (hasRig && overhang)
    extra.push(
      check(
        'overhang',
        'Pedalera',
        `Sobresale ${Math.ceil(pedalEnd - s.length)} cm`,
        'error',
        'Alarga el chasis o retrasa la pedalera',
      ),
    );
  if (hasRig && seatBackZ < 0)
    extra.push(
      check(
        'seatback',
        'Respaldo',
        `Sobresale ${Math.ceil(-seatBackZ)} cm`,
        'warning',
        'La huella del conjunto incluye este saliente',
      ),
    );
  if (setupPoints.length && s.roomEnabled !== false && !roomFits)
    extra.push(
      check(
        'room',
        'Zona disponible',
        'Fuera de zona',
        'error',
        'Mueve los elementos o ajusta el origen y tamaño de la zona',
      ),
    );
  else if (setupPoints.length && s.roomEnabled !== false)
    extra.push(
      check(
        'room',
        'Reserva lateral',
        aisleFits ? `${s.aisle} cm posibles` : 'Insuficiente',
        aisleFits ? 'ok' : 'warning',
        'Banda sin muebles ni barrido de puerta; no verifica una ruta de acceso',
      ),
    );
  if (hasRig && s.centerStick && s.wheel && Math.abs(s.stickZ - s.wheelZ) < 24)
    extra.push(
      check(
        'mode',
        'Mandos centrales',
        'Revisar montaje',
        'warning',
        'El joystick y volante comparten zona: desmontaje alterno',
      ),
    );
  if (!hasRig) bodyCheck.length = 0;
  for (let i = spaceCheck.length - 1; i >= 0; i--) {
    const id = spaceCheck[i].id;
    if (
      (['side', 'collision'].includes(id) && !(hasRig && hasDesk)) ||
      (['arm', 'lift', 'vr'].includes(id) && !hasMonitor) ||
      (id === 'screen' && !(hasRig && hasMonitor))
    )
      spaceCheck.splice(i, 1);
  }
  for (let i = desktopChecks.length - 1; i >= 0; i--) {
    const id = desktopChecks[i].id;
    if (!hasDesk || (id === 'mouse-mat' && !(mat && mouse)) || (id === 'mount' && !hasMonitor))
      desktopChecks.splice(i, 1);
  }
  const checks = [...bodyCheck, ...spaceCheck, ...desktopChecks, ...extra, ...room.checks],
    errors = checks.filter((c) => c.level === 'error').length,
    warnings = checks.filter((c) => c.level === 'warning').length;
  return {
    body: hasRig ? body : null,
    bodyCheck,
    spaceCheck,
    desktopChecks,
    desktopItems,
    desktopOverlaps,
    mouseOnMat,
    extra,
    checks,
    errors,
    warnings,
    rigLeft,
    rigRight,
    deskLeft,
    deskRight,
    deskBack,
    deskFront,
    monitorW,
    monitorH,
    clampPoint,
    monitorPoint,
    reach,
    lift,
    spaceW,
    spaceD,
    allLeft,
    allRight,
    allBack,
    allFront,
    freeW,
    freeD,
    lowerZ,
    upperZ,
    sideGap,
    rigPose,
    deskPose,
    rigPolygon,
    deskPolygon,
    tabletopPolygon,
    deskBounds: bounds,
    monitorAngle,
    armPose,
    drivingMount: driving,
    collisionCount,
    roomFits,
    roomBounds,
    clearances,
    aisleFits,
    freeBand,
    room,
    ...getParts(s),
  };
}
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
