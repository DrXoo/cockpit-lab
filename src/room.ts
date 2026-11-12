// Room model: walls, openings, furniture and their checks. All lengths are in cm.
// Plan coordinates follow the app convention: X lateral, Z depth, +Y height from the floor.
import {
  clamp,
  degToRad,
  round,
  rectangle,
  overlapDepth,
  transformPoint,
  type PlanPoint,
  type Point3,
  type Polygon,
} from './geometry.ts';
import type { Check, CheckLevel } from './checks.ts';
import { cleanUserText } from './user-text.ts';

export type WallId = 'north' | 'east' | 'south' | 'west';
export type FurnitureType =
  'chair' | 'shelf' | 'wallShelf' | 'wardrobe' | 'bed' | 'cabinet' | 'obstacle';

export const wallNames: Record<WallId, string> = {
  north: 'AB · top',
  east: 'BC · right',
  south: 'CD · bottom',
  west: 'DA · left',
};
export const furnitureNames: Record<FurnitureType, string> = {
  chair: 'Office chair',
  shelf: 'Bookcase',
  wallShelf: 'Wall shelf',
  wardrobe: 'Wardrobe',
  bed: 'Bed',
  cabinet: 'Drawer unit',
  obstacle: 'Other furniture',
};

// Tolerances. Below these values two volumes are in contact, not interfering.
/** A footprint may stick out of the room by this much before it counts as outside. */
const OUTSIDE_TOLERANCE_CM = 0.01;
/** Minimum vertical overlap for two volumes to share height. */
const HEIGHT_OVERLAP_CM = 0.1;
/** Minimum overlap along a wall for an opening to collide with another opening or a shelf mount. */
const WALL_SPAN_OVERLAP_CM = 0.1;
/** Minimum plan penetration for furniture and clearance zones to interfere. */
const FOOTPRINT_OVERLAP_CM = 0.15;
/** Minimum plan penetration for an obstacle to block a door sweep. */
const DOOR_SWEEP_OVERLAP_CM = 0.1;

/** Furniture positions are limited to ±15 m around the origin. */
const POSITION_LIMIT_CM = 1500;
const DEFAULT_ROOM_HEIGHT_CM = 250;
const MAX_FEATURES = 24;
const MAX_FURNITURE = 30;
const MAX_NAME_LENGTH = 45;
/** Half thickness of a door leaf in plan. */
const DOOR_LEAF_HALF_THICKNESS_CM = 1.8;
/** Door sweeps are sampled every 2°. */
const DOOR_SWEEP_STEP_DEG = 2;
/** Gap between the desk edge and the office chair when it is placed automatically. */
const CHAIR_DESK_GAP_CM = 8;

/** The room's interior in cm; (roomX, roomZ) is corner A. */
export interface RoomBounds {
  roomX: number;
  roomZ: number;
  roomW: number;
  roomD: number;
  roomH: number;
}

/** A wall as a line from its starting corner: tangent (tx, tz) and inward normal (nx, nz). */
export interface WallFrame {
  x: number;
  z: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
  length: number;
  corner: 'A' | 'B' | 'C' | 'D';
}

interface WallOpening {
  id: string;
  name: string;
  wall: WallId;
  /** Distance from the wall's starting corner to the opening. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom edge above the floor. */
  sill: number;
  /** Depth of the zone kept free in front of the opening. */
  clearance: number;
}

export interface Door extends WallOpening {
  type: 'door';
  hinge: 'start' | 'end';
  swing: 'in' | 'out';
  openAngle: number;
}

/** Windows keep the door fields; their sashes are not simulated. */
export interface Window extends Omit<Door, 'type'> {
  type: 'window';
}

/** Sliding-door wardrobe front: only the clearance in front of it is checked. */
export interface WardrobeAccess extends WallOpening {
  type: 'wardrobeAccess';
}

export type RoomFeature = Door | Window | WardrobeAccess;

interface FurnitureBase {
  id: string;
  name: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  angle: number;
}

export interface Chair extends FurnitureBase {
  type: 'chair';
  seatHeight: number;
  /** Space needed behind the chair to pull it back. */
  pullback: number;
}

export interface WallShelf extends FurnitureBase {
  type: 'wallShelf';
  mountWall: WallId;
  offset: number;
  /** Height of the shelf's bottom above the floor. */
  elevation: number;
}

export interface FloorFurniture extends FurnitureBase {
  type: Exclude<FurnitureType, 'chair' | 'wallShelf'>;
}

export type FurnitureItem = Chair | WallShelf | FloorFurniture;

/** A prism: a footprint extruded from y0 to y1. */
export interface Solid {
  polygon: Polygon;
  y0: number;
  y1: number;
}

/** Anything that can block furniture, openings or clearance zones. */
export interface Obstacle extends Solid {
  label: string;
  id?: string;
  type?: string;
  /** Finer volumes that replace the bounding prism in collision checks. */
  solids?: Solid[];
}

export type FurnitureGeometry = FurnitureItem &
  Obstacle & {
    id: string;
    polygon: Point3[];
    reserve?: Point3[];
  };

interface FeatureFrame {
  frame: WallFrame;
  a: PlanPoint;
  b: PlanPoint;
  center: PlanPoint;
}

export type DoorGeometry = Door &
  FeatureFrame & {
    hingePoint: PlanPoint;
    tip: PlanPoint;
    arc: PlanPoint[];
    sectors: PlanPoint[][];
    leaf: Point3[];
  };

export type ReserveGeometry = (Window | WardrobeAccess) &
  FeatureFrame & {
    reserve: Point3[];
    sectors: [];
  };

export type FeatureGeometry = DoorGeometry | ReserveGeometry;

export interface RoomInput {
  roomFeatures?: unknown;
  roomFurniture?: unknown;
}

export interface NormalizedRoom {
  roomH: number;
  roomFeatures: RoomFeature[];
  roomFurniture: FurnitureItem[];
}

export interface RoomEvaluation {
  features: FeatureGeometry[];
  furniture: FurnitureGeometry[];
  checks: Check[];
  collisions: string[];
  doorHits: string[];
  windowHits: string[];
  accessHits: string[];
}

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null;

const isWallId = (value: unknown): value is WallId =>
  typeof value === 'string' && Object.hasOwn(wallNames, value);

const isFurnitureType = (value: unknown): value is FurnitureType =>
  typeof value === 'string' && Object.hasOwn(furnitureNames, value);

const text = (value: unknown, fallback: string): string =>
  cleanUserText(value, fallback, MAX_NAME_LENGTH);

/** A finite number clamped to [min, max]; anything else becomes the fallback, unclamped. */
const number = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback;

const roomHeight = (room: { roomH?: unknown }): number =>
  number(room.roomH, DEFAULT_ROOM_HEIGHT_CM, 180, 400);

/** Walls run clockwise from corner A (north-west): AB, BC, CD and DA. Unknown walls map to north. */
export function wallFrame(room: RoomBounds, wall: unknown): WallFrame {
  const { roomX: x, roomZ: z, roomW: w, roomD: d } = room;
  const frames: Record<WallId, WallFrame> = {
    north: { x, z, tx: 1, tz: 0, nx: 0, nz: 1, length: w, corner: 'A' },
    east: { x: x + w, z, tx: 0, tz: 1, nx: -1, nz: 0, length: d, corner: 'B' },
    south: { x: x + w, z: z + d, tx: -1, tz: 0, nx: 0, nz: -1, length: w, corner: 'C' },
    west: { x, z: z + d, tx: 0, tz: -1, nx: 1, nz: 0, length: d, corner: 'D' },
  };
  return frames[isWallId(wall) ? wall : 'north'];
}

/** A wall shelf before it is placed: its wall and offset may still be unvalidated input. */
export type WallShelfDraft = Omit<WallShelf, 'mountWall' | 'offset'> & {
  mountWall?: unknown;
  offset?: unknown;
};

/** The shelf's back edge rests on its wall; +Y is still the height from the floor (cm). */
export function placeWallShelf(room: RoomBounds, item: WallShelfDraft): WallShelf {
  const mountWall = isWallId(item.mountWall) ? item.mountWall : 'north';
  const frame = wallFrame(room, mountWall);
  const maxOffset = Math.max(0, frame.length - item.width);
  const offset = clamp(round(number(item.offset, maxOffset / 2, 0, maxOffset)), 0, maxOffset);
  const center = offset + item.width / 2;
  return {
    ...item,
    mountWall,
    offset,
    x: frame.x + frame.tx * center + (frame.nx * item.depth) / 2,
    z: frame.z + frame.tz * center + (frame.nz * item.depth) / 2,
    angle: ((Math.atan2(-frame.tz, frame.tx) * 180) / Math.PI + 360) % 360,
  };
}

/** Gives each item a unique, safe id, generating one when the input has none. */
function createIdAllocator() {
  const ids = new Set<string>();
  return (value: unknown, prefix: string, index: number): string => {
    let id =
      typeof value === 'string' && /^[a-z0-9-]{1,50}$/i.test(value)
        ? value
        : `${prefix}-${index + 1}`;
    while (ids.has(id)) id += '-copy';
    ids.add(id);
    return id;
  };
}

type IdAllocator = ReturnType<typeof createIdAllocator>;

function normalizeWardrobeAccess(
  room: RoomBounds,
  raw: RawRecord,
  index: number,
  idFor: IdAllocator,
): WardrobeAccess {
  const wall = isWallId(raw.wall) ? raw.wall : 'north';
  const frame = wallFrame(room, wall);
  const width = number(raw.width, Math.min(180, frame.length), 30, frame.length);
  const height = roomHeight(room);
  return {
    id: idFor(raw.id, 'access', index),
    type: 'wardrobeAccess',
    name: text(raw.name, 'Built-in wardrobe'),
    wall,
    width,
    offset: number(raw.offset, Math.max(0, (frame.length - width) / 2), 0, frame.length - width),
    clearance: number(raw.clearance, 80, 0, 200),
    sill: 0,
    height: number(raw.height, height, 30, height),
  };
}

function normalizeOpening(
  room: RoomBounds,
  raw: RawRecord & { type: 'door' | 'window' },
  index: number,
  idFor: IdAllocator,
): Door | Window {
  const isDoor = raw.type === 'door';
  const wall = isWallId(raw.wall) ? raw.wall : 'north';
  const frame = wallFrame(room, wall);
  const width = number(raw.width, isDoor ? 80 : 120, 30, Math.min(300, frame.length));
  const height = number(raw.height, isDoor ? 205 : 120, 30, room.roomH);
  const sill = isDoor ? 0 : number(raw.sill, 100, 0, room.roomH - height);
  return {
    id: idFor(raw.id, 'opening', index),
    type: raw.type,
    name: text(raw.name, isDoor ? 'Door' : 'Window'),
    wall,
    width,
    height,
    sill,
    offset: number(raw.offset, 10, 0, frame.length - width),
    hinge: raw.hinge === 'end' ? 'end' : 'start',
    swing: raw.swing === 'out' ? 'out' : 'in',
    openAngle: number(raw.openAngle, 90, 0, 180),
    clearance: number(raw.clearance, 60, 0, 150),
  };
}

const FEATURE_TYPES = ['door', 'window', 'wardrobeAccess'] as const;
type RawFeature = RawRecord & { type: RoomFeature['type'] };

const isRawFeature = (value: unknown): value is RawFeature =>
  isRecord(value) && (FEATURE_TYPES as readonly unknown[]).includes(value.type);

function normalizeFurniture(
  room: RoomBounds,
  raw: RawRecord,
  index: number,
  idFor: IdAllocator,
): FurnitureItem {
  const type = isFurnitureType(raw.type) ? raw.type : 'shelf';
  const chair = type === 'chair';
  const mounted = type === 'wallShelf';
  // Key order matches the saved JSON: id, type, name, position, size, angle.
  const base: FurnitureBase & { type: FurnitureType } = {
    id: idFor(raw.id, 'furniture', index),
    type,
    name: text(raw.name, furnitureNames[type]),
    x: number(raw.x, room.roomX + room.roomW / 2, -POSITION_LIMIT_CM, POSITION_LIMIT_CM),
    z: number(raw.z, room.roomZ + room.roomD / 2, -POSITION_LIMIT_CM, POSITION_LIMIT_CM),
    width: number(raw.width, chair ? 65 : mounted ? 100 : 80, chair ? 40 : 10, chair ? 100 : 350),
    depth: number(raw.depth, chair ? 65 : mounted ? 30 : 35, chair ? 40 : 10, chair ? 100 : 250),
    height: number(
      raw.height,
      chair ? 115 : mounted ? 40 : 180,
      chair ? 70 : mounted ? 2 : 10,
      chair ? 180 : 350,
    ),
    angle: number(raw.angle, 0, 0, 359),
  };
  if (type === 'wallShelf')
    return placeWallShelf(room, {
      ...base,
      type,
      mountWall: raw.mountWall,
      offset: raw.offset,
      elevation: number(raw.elevation, 140, 0, room.roomH),
    });
  if (type === 'chair')
    return {
      ...base,
      type,
      seatHeight: number(raw.seatHeight, 47, 30, Math.min(65, base.height - 20)),
      pullback: number(raw.pullback, 50, 0, 150),
    };
  return { ...base, type };
}

/**
 * Validates the room's openings and furniture from `input` (for example an imported file),
 * keeping every other property of `room`.
 */
export function normalizeRoom<T extends RoomBounds & RoomInput>(
  room: T,
  input: RoomInput = room,
): Omit<T, keyof NormalizedRoom> & NormalizedRoom {
  const idFor = createIdAllocator();
  const features = Array.isArray(input.roomFeatures)
    ? input.roomFeatures.slice(0, MAX_FEATURES)
    : [];
  const furniture = Array.isArray(input.roomFurniture)
    ? input.roomFurniture.slice(0, MAX_FURNITURE)
    : [];
  return {
    ...room,
    roomH: roomHeight(room),
    roomFeatures: features
      .filter(isRawFeature)
      .map((raw, index) =>
        raw.type === 'wardrobeAccess'
          ? normalizeWardrobeAccess(room, raw, index, idFor)
          : normalizeOpening(room, { ...raw, type: raw.type }, index, idFor),
      ),
    roomFurniture: normalizeFurnitureList(room, furniture, idFor),
  };
}

function normalizeFurnitureList(
  room: RoomBounds,
  furniture: unknown[],
  idFor: IdAllocator,
): FurnitureItem[] {
  return furniture
    .filter(isRecord)
    .map((raw, index) => normalizeFurniture(room, raw, index, idFor));
}

export function featureGeometry(room: RoomBounds, item: RoomFeature): FeatureGeometry {
  const frame = wallFrame(room, item.wall);
  const alongWall = (distance: number): PlanPoint => ({
    x: frame.x + frame.tx * distance,
    z: frame.z + frame.tz * distance,
  });
  const a = alongWall(item.offset);
  const b = alongWall(item.offset + item.width);
  const center = alongWall(item.offset + item.width / 2);
  if (item.type !== 'door') {
    const clearance = item.clearance;
    const angle = (Math.atan2(-frame.tz, frame.tx) * 180) / Math.PI;
    return {
      ...item,
      frame,
      a,
      b,
      center,
      reserve: rectangle(-item.width / 2, item.width / 2, -clearance / 2, clearance / 2, {
        x: center.x + (frame.nx * clearance) / 2,
        z: center.z + (frame.nz * clearance) / 2,
        angle,
      }),
      sectors: [],
    };
  }
  const hinge = item.hinge === 'end' ? b : a;
  const sign = item.hinge === 'end' ? -1 : 1;
  const inward = item.swing === 'out' ? -1 : 1;
  const leafEnd = (angle: number): PlanPoint => ({
    x:
      hinge.x +
      item.width * (frame.tx * sign * Math.cos(angle) + frame.nx * inward * Math.sin(angle)),
    z:
      hinge.z +
      item.width * (frame.tz * sign * Math.cos(angle) + frame.nz * inward * Math.sin(angle)),
  });
  const arc: PlanPoint[] = [];
  const sectors: PlanPoint[][] = [];
  const steps = Math.max(1, Math.ceil(item.openAngle / DOOR_SWEEP_STEP_DEG));
  for (let i = 0; i <= steps; i++) arc.push(leafEnd((degToRad(item.openAngle) * i) / steps));
  for (let i = 1; i < arc.length; i++)
    if (item.openAngle > 0.01) sectors.push([hinge, arc[i - 1], arc[i]]);
  const tip = arc[arc.length - 1];
  const leafAngle = (Math.atan2(-(tip.z - hinge.z), tip.x - hinge.x) * 180) / Math.PI;
  const leaf = rectangle(
    -item.width / 2,
    item.width / 2,
    -DOOR_LEAF_HALF_THICKNESS_CM,
    DOOR_LEAF_HALF_THICKNESS_CM,
    { x: (hinge.x + tip.x) / 2, z: (hinge.z + tip.z) / 2, angle: leafAngle },
  );
  return { ...item, frame, a, b, center, hingePoint: hinge, tip, arc, sectors, leaf };
}

export interface DeskPose {
  deskDepth: number;
  deskX: number;
  deskZ: number;
  deskAngle: number;
}

/** Places the office chair facing the desk, just behind its front edge. */
export function officeChairPlacement(desk: DeskPose, item: { depth: number } = { depth: 65 }) {
  const center = transformPoint(
    { x: -desk.deskDepth / 2 - item.depth / 2 - CHAIR_DESK_GAP_CM, z: 0 },
    { x: desk.deskX, z: desk.deskZ, angle: desk.deskAngle },
  );
  return { x: round(center.x), z: round(center.z), angle: (desk.deskAngle + 270) % 360 };
}

/** The chair is split into base, seat, backrest and armrests so it can slide under a desk. */
function chairSolids(item: Chair, pose: { x: number; z: number; angle: number }): Solid[] {
  const { width: w, depth: d, height: h, seatHeight: seat } = item;
  const solid = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) => ({
    polygon: rectangle(x0, x1, z0, z1, pose),
    y0,
    y1,
  });
  const solids = [
    solid(-w / 2, w / 2, -d / 2, d / 2, 0, 11),
    solid(-w * 0.36, w * 0.36, -d * 0.35, d * 0.35, seat - 7, seat),
    solid(-w * 0.36, w * 0.36, d * 0.3 - 2.5, d * 0.3 + 2.5, seat, h),
  ];
  for (const side of [-1, 1])
    solids.push(
      solid(
        side * w * 0.43 - 1.5,
        side * w * 0.43 + 1.5,
        -d * 0.275,
        d * 0.275,
        seat + 15,
        Math.min(h, seat + 21),
      ),
    );
  return solids;
}

export function furnitureGeometry(item: FurnitureItem): FurnitureGeometry {
  const pose = { x: item.x, z: item.z, angle: item.angle };
  const { width: w, depth: d, height: h } = item;
  const bottom = item.type === 'wallShelf' ? item.elevation : 0;
  const result: FurnitureGeometry = {
    ...item,
    label: item.name,
    y0: bottom,
    y1: bottom + h,
    polygon: rectangle(-w / 2, w / 2, -d / 2, d / 2, pose),
  };
  if (item.type === 'chair') {
    result.solids = chairSolids(item, pose);
    if (item.pullback > 0)
      result.reserve = rectangle(-w / 2, w / 2, d / 2, d / 2 + item.pullback, pose);
  }
  return result;
}

/** Moves a dragged furniture item (`furniture:<id>`) or opening (`feature:<id>`) to (x, z). */
export function moveRoomTarget<T extends RoomBounds & NormalizedRoom>(
  room: T,
  target: string,
  x: number,
  z: number,
): T {
  if (target.startsWith('furniture:')) {
    const id = target.slice('furniture:'.length);
    return {
      ...room,
      roomFurniture: room.roomFurniture.map((item) => {
        if (item.id !== id) return item;
        if (item.type === 'wallShelf') {
          const frame = wallFrame(room, item.mountWall);
          return placeWallShelf(room, {
            ...item,
            offset: (x - frame.x) * frame.tx + (z - frame.z) * frame.tz - item.width / 2,
          });
        }
        return {
          ...item,
          x: round(clamp(x, -POSITION_LIMIT_CM, POSITION_LIMIT_CM)),
          z: round(clamp(z, -POSITION_LIMIT_CM, POSITION_LIMIT_CM)),
        };
      }),
    };
  }
  if (target.startsWith('feature:')) {
    const id = target.slice('feature:'.length);
    return {
      ...room,
      roomFeatures: room.roomFeatures.map((feature) => {
        if (feature.id !== id) return feature;
        const frame = wallFrame(room, feature.wall);
        const offset = (x - frame.x) * frame.tx + (z - frame.z) * frame.tz - feature.width / 2;
        return { ...feature, offset: round(clamp(offset, 0, frame.length - feature.width)) };
      }),
    };
  }
  return room;
}

const uniqueLabels = (obstacles: Obstacle[]): string[] => [
  ...new Set(obstacles.map((obstacle) => obstacle.label)),
];

const sharesHeight = (a: { y0: number; y1: number }, b: { y0: number; y1: number }): boolean =>
  Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > HEIGHT_OVERLAP_CM;

const collides = (a: Obstacle, b: Obstacle): boolean =>
  (a.solids || [a]).some((x) =>
    (b.solids || [b]).some(
      (y) => sharesHeight(x, y) && overlapDepth(x.polygon, y.polygon) > FOOTPRINT_OVERLAP_CM,
    ),
  );

const wallSpanOverlap = (
  a: { offset: number; width: number },
  b: { offset: number; width: number },
): number => Math.min(a.offset + a.width, b.offset + b.width) - Math.max(a.offset, b.offset);

export interface RoomState extends RoomBounds {
  roomEnabled?: boolean;
  roomFeatures?: RoomFeature[];
  roomFurniture?: FurnitureItem[];
}

export function evaluateRoom(room: RoomState, setupSolids: Obstacle[]): RoomEvaluation {
  const features = (room.roomFeatures || []).map((feature) => featureGeometry(room, feature));
  const furniture = (room.roomFurniture || []).map(furnitureGeometry);
  const checks: Check[] = [];
  const collisions: string[] = [];
  const doorHits = new Set<string>();
  const windowHits = new Set<string>();
  const accessHits = new Set<string>();
  if (room.roomEnabled === false)
    return {
      features,
      furniture,
      checks,
      collisions,
      doorHits: [],
      windowHits: [],
      accessHits: [],
    };
  const add = (id: string, label: string, value: string, level: CheckLevel, detail: string) =>
    checks.push({ id, label, value, level, detail });
  const isOutside = (points: PlanPoint[], tolerance: number) =>
    points.some(
      (p) =>
        p.x < room.roomX - tolerance ||
        p.x > room.roomX + room.roomW + tolerance ||
        p.z < room.roomZ - tolerance ||
        p.z > room.roomZ + room.roomD + tolerance,
    );

  for (const item of furniture) {
    const outside =
      isOutside(item.polygon, OUTSIDE_TOLERANCE_CM) ||
      item.y1 > (room.roomH || DEFAULT_ROOM_HEIGHT_CM);
    if (outside)
      add(
        'room-out-' + item.id,
        item.name,
        'Outside the room',
        'error',
        'Sticks out of a wall or the ceiling',
      );
    const hits = uniqueLabels(setupSolids.filter((solid) => collides(item, solid)));
    if (hits.length) {
      collisions.push(item.id);
      add('room-furniture-' + item.id, item.name, 'Interference', 'error', hits.join(' · '));
    }
  }
  for (let i = 0; i < furniture.length; i++)
    for (let j = i + 1; j < furniture.length; j++)
      if (collides(furniture[i], furniture[j])) {
        collisions.push(furniture[i].id, furniture[j].id);
        add(
          'room-pair-' + furniture[i].id + '-' + furniture[j].id,
          'Overlapping furniture',
          'Check',
          'error',
          furniture[i].name + ' / ' + furniture[j].name,
        );
      }
  const obstacles: Obstacle[] = [...setupSolids, ...furniture];

  // Contact with the wall is intended; an opening offers no surface to mount on.
  for (const item of furniture) {
    if (item.type !== 'wallShelf') continue;
    const hits = features.filter(
      (feature) =>
        feature.wall === item.mountWall &&
        wallSpanOverlap(feature, item) > WALL_SPAN_OVERLAP_CM &&
        sharesHeight(item, { y0: feature.sill, y1: feature.sill + feature.height }),
    );
    if (hits.length) {
      collisions.push(item.id);
      add(
        'room-mount-' + item.id,
        item.name,
        'Mounted over an opening',
        'error',
        hits.map((feature) => feature.name).join(' · '),
      );
    }
  }

  for (const item of furniture) {
    if (item.type !== 'chair' || !item.reserve) continue;
    const reserve = item.reserve;
    const hits = uniqueLabels(
      obstacles.filter(
        (o) =>
          o.id !== item.id &&
          o.y0 < item.height &&
          overlapDepth(reserve, o.polygon) > FOOTPRINT_OVERLAP_CM,
      ),
    );
    const outside = isOutside(reserve, 0);
    const blocked = hits.length > 0 || outside;
    add(
      'room-chair-' + item.id,
      'Pulling back ' + item.name,
      blocked ? 'Clearance taken' : `${item.pullback} cm clear`,
      blocked ? 'warning' : 'ok',
      `${item.pullback} cm back${outside ? ' · outside the room' : ''}${hits.length ? ' · ' + hits.join(' · ') : ''}; approximate clearance`,
    );
  }

  for (const item of features) {
    if (item.type === 'door') {
      const hits = uniqueLabels(
        obstacles.filter(
          (o) =>
            o.y0 < item.height &&
            o.y1 > 0 &&
            (overlapDepth(item.leaf, o.polygon) > DOOR_SWEEP_OVERLAP_CM ||
              item.sectors.some(
                (sector) => overlapDepth(sector, o.polygon) > DOOR_SWEEP_OVERLAP_CM,
              )),
        ),
      );
      if (hits.length) doorHits.add(item.id);
      add(
        'room-door-' + item.id,
        item.name,
        hits.length ? 'Swing blocked' : `${item.openAngle}° clear`,
        hits.length ? 'error' : 'ok',
        hits.length
          ? hits.join(' · ')
          : `Swing from 0° to ${item.openAngle}° · ${item.swing === 'out' ? 'outwards' : 'inwards'}`,
      );
    } else if (item.type === 'wardrobeAccess') {
      if (item.clearance <= 0) {
        add(
          'room-access-' + item.id,
          item.name,
          'Clearance off',
          'warning',
          'Sliding doors have no swing; set a clear band in front to check the access',
        );
        continue;
      }
      const hits = uniqueLabels(
        obstacles.filter(
          (o) =>
            sharesHeight(o, { y0: 0, y1: item.height }) &&
            overlapDepth(item.reserve, o.polygon) > FOOTPRINT_OVERLAP_CM,
        ),
      );
      const outside = isOutside(item.reserve, OUTSIDE_TOLERANCE_CM);
      if (hits.length || outside) accessHits.add(item.id);
      add(
        'room-access-' + item.id,
        item.name,
        hits.length ? 'Access blocked' : outside ? 'Clearance outside the room' : 'Access clear',
        hits.length || outside ? 'warning' : 'ok',
        `${item.clearance} cm clearance in front · sliding doors without a swing${hits.length ? ' · ' + hits.join(' · ') : ''}${outside ? ' · the band leaves the room' : ''}; access clearance only, no inside volume`,
      );
    } else if (item.clearance > 0) {
      const hits = uniqueLabels(
        obstacles.filter(
          (o) =>
            (o.type !== 'wallShelf' ||
              sharesHeight(o, { y0: item.sill, y1: item.sill + item.height })) &&
            overlapDepth(item.reserve, o.polygon) > FOOTPRINT_OVERLAP_CM,
        ),
      );
      if (hits.length) windowHits.add(item.id);
      add(
        'room-window-' + item.id,
        item.name,
        hits.length ? 'Clearance taken' : 'Clearance free',
        hits.length ? 'warning' : 'ok',
        `${item.clearance} cm in front${hits.length ? ' · ' + hits.join(' · ') : ''}; window sashes not simulated`,
      );
    }
  }

  for (let i = 0; i < features.length; i++)
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (
        a.wall === b.wall &&
        wallSpanOverlap(a, b) > WALL_SPAN_OVERLAP_CM &&
        Math.min(a.sill + a.height, b.sill + b.height) - Math.max(a.sill, b.sill) >
          HEIGHT_OVERLAP_CM
      )
        add(
          'room-openings-' + a.id + '-' + b.id,
          'Overlapping openings',
          'Check',
          'error',
          a.name + ' / ' + b.name,
        );
    }
  if (!collisions.length)
    add(
      'room-furniture',
      'Furniture and setup',
      'No clash',
      'ok',
      'Envelopes with rotation and height; strength is not calculated',
    );
  return {
    features,
    furniture,
    checks,
    collisions: [...new Set(collisions)],
    doorHits: [...doorHits],
    windowHits: [...windowHits],
    accessHits: [...accessHits],
  };
}
