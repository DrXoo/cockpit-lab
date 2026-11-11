// The desk: tabletop bounds, the arm anchor and the items placed on it. Lengths in cm.
import { clamp, degToRad, rectangle, round, transformPoint } from './geometry.ts';
import { defaults, type ClampSide, type CockpitConfig, type NumericField } from './config.ts';
import { pose } from './layout.ts';

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
  const angle = degToRad(item.local.angle),
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
