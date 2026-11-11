// The room as drawn: floor, walls with their openings, furniture and the free band.
// Everything is in world coordinates; the room's measurements go to the dimensions group.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad, type PlanPoint } from './geometry.ts';
import type { MaterialRef, ParentRef, RenderList, Vec3 } from './render-list.ts';
import {
  wallFrame,
  type DoorGeometry,
  type FurnitureGeometry,
  type ReserveGeometry,
  type WallFrame,
  type WallId,
} from './room.ts';

type Chair = Extract<FurnitureGeometry, { type: 'chair' }>;

const WALLS: WallId[] = ['north', 'east', 'south', 'west'];
const QUARTER_TURN = Math.PI / 2;
/** Without full walls, the walls are drawn as a low outline of this height. */
const LOW_WALL_HEIGHT_CM = 14;
const WALL_THICKNESS_CM = 7;
/** Wall pieces shorter or narrower than this are not drawn. */
const MIN_WALL_PIECE_CM = 0.05;
/** Without full walls, door leaves are cut to this height so they do not hide the plan. */
const LOW_DOOR_LEAF_CM = 55;
/** Height above the floor of the filled plan zones. */
const ZONE_HEIGHT_CM = 0.8;
/** Shelves get one level for each of these heights. */
const SHELF_LEVEL_SPACING_CM = 35;
const BLOCKED_COLOR = '#b94f35';
const CHAIR_WHEELS = 5;

const flat = (r: RenderList, color: string, opacity = 1) =>
  r.material({ kind: 'flat', color, opacity });
const outline = (r: RenderList, color: string, opacity?: number) =>
  r.material(opacity === undefined ? { kind: 'line', color } : { kind: 'line', color, opacity });
/** A closed plan outline at the given height. */
const closedLoop = (points: readonly PlanPoint[], y: number): Vec3[] =>
  [...points, points[0]].map((p) => [p.x, y, p.z]);
const segment = (a: PlanPoint, b: PlanPoint, y: number): Vec3[] => [
  [a.x, y, a.z],
  [b.x, y, b.z],
];
const centroidOfFour = (points: readonly PlanPoint[]) =>
  points.reduce((sum, p) => ({ x: sum.x + p.x / 4, z: sum.z + p.z / 4 }), { x: 0, z: 0 });

interface RoomMaterials {
  wall: MaterialRef;
  door: MaterialRef;
  window: MaterialRef;
  furniture: MaterialRef;
  furnitureDetail: MaterialRef;
}

export function drawRoom(
  r: RenderList,
  parent: ParentRef,
  dimensions: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
): void {
  if (s.roomEnabled === false) return;
  const materials: RoomMaterials = {
    wall: flat(r, '#b9c2ae', s.roomFullWalls ? 0.32 : 0.85),
    door: flat(r, '#b8754f', 0.83),
    window: flat(r, '#92b9bd', 0.42),
    furniture: r.material({ kind: 'matte', color: '#a6af96', roughness: 0.9 }),
    furnitureDetail: r.material({ kind: 'matte', color: '#76866d', roughness: 0.9 }),
  };
  r.plane(
    s.roomW,
    s.roomD,
    [s.roomX + s.roomW / 2, 0.08, s.roomZ + s.roomD / 2],
    flat(r, '#e5e9dd', 0.8),
    parent,
  );
  const wallHeight = s.roomFullWalls ? s.roomH : LOW_WALL_HEIGHT_CM;
  for (const wall of WALLS) drawWall(r, parent, s, e, wall, wallHeight, materials.wall);
  drawRoomMeasurements(r, parent, dimensions, s);
  for (const item of e.room.features) {
    if (item.type === 'door') drawDoor(r, parent, s, e, item, materials.door);
    else if (item.type === 'wardrobeAccess') drawWardrobeAccess(r, parent, e, item);
    else drawWindow(r, parent, item, materials.window);
  }
  for (const item of e.room.furniture) drawFurniture(r, parent, e, item, materials);
  if (e.freeBand) {
    r.fill(e.freeBand.polygon, '#adc298', 0.18, ZONE_HEIGHT_CM, parent);
    const center = centroidOfFour(e.freeBand.polygon);
    r.label(`CLEARANCE ${s.aisle} cm`, center.x, 1, center.z).topOnly = true;
  }
}

/** A wall split around its openings: doors leave a gap up to their top, windows also a sill. */
function drawWall(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  wall: WallId,
  wallHeight: number,
  material: MaterialRef,
) {
  const f = wallFrame(s, wall);
  const openings = e.room.features
    .filter((item) => item.wall === wall)
    .sort((a, b) => a.offset - b.offset);
  const piece = (start: number, end: number, bottom: number, top: number) =>
    drawWallPiece(r, parent, f, { start, end, bottom, top }, material);
  let end = 0;
  for (const item of openings) {
    piece(end, item.offset, 0, wallHeight);
    if (item.type === 'window')
      piece(item.offset, item.offset + item.width, 0, Math.min(wallHeight, item.sill));
    piece(item.offset, item.offset + item.width, item.sill + item.height, wallHeight);
    end = Math.max(end, item.offset + item.width);
  }
  piece(end, f.length, 0, wallHeight);
}

/** A piece of wall between two distances along it, set outside the room's interior. */
function drawWallPiece(
  r: RenderList,
  parent: ParentRef,
  f: WallFrame,
  { start, end, bottom, top }: { start: number; end: number; bottom: number; top: number },
  material: MaterialRef,
) {
  if (end - start < MIN_WALL_PIECE_CM || top - bottom < MIN_WALL_PIECE_CM) return;
  const along = (start + end) / 2;
  const halfThickness = WALL_THICKNESS_CM / 2;
  r.box(
    f.tx ? end - start : WALL_THICKNESS_CM,
    top - bottom,
    f.tz ? end - start : WALL_THICKNESS_CM,
    f.x + f.tx * along - f.nx * halfThickness,
    (bottom + top) / 2,
    f.z + f.tz * along - f.nz * halfThickness,
    material,
    parent,
  );
}

/** Corner names, the room size and the origin cross. */
function drawRoomMeasurements(
  r: RenderList,
  parent: ParentRef,
  dimensions: ParentRef,
  s: CockpitConfig,
) {
  const corners: [number, number, string][] = [
    [s.roomX, s.roomZ, 'A'],
    [s.roomX + s.roomW, s.roomZ, 'B'],
    [s.roomX + s.roomW, s.roomZ + s.roomD, 'C'],
    [s.roomX, s.roomZ + s.roomD, 'D'],
  ];
  for (const [x, z, name] of corners) r.label(name, x, 1, z, true).topOnly = true;
  r.dimension(
    [s.roomX, 0.9, s.roomZ - 15],
    [s.roomX + s.roomW, 0.9, s.roomZ - 15],
    `ROOM · ${s.roomW} cm`,
    [0, 0, -5],
    dimensions,
  ).topOnly = true;
  r.dimension(
    [s.roomX + s.roomW + 16, 0.9, s.roomZ],
    [s.roomX + s.roomW + 16, 0.9, s.roomZ + s.roomD],
    `${s.roomD} cm`,
    [8, 0, 0],
    dimensions,
  ).topOnly = true;
  r.line(
    [
      [-5, 0.7, 0],
      [5, 0.7, 0],
    ],
    'dim',
    parent,
  );
  r.line(
    [
      [0, 0.7, -5],
      [0, 0.7, 5],
    ],
    'dim',
    parent,
  );
  r.label('0,0', 0, 0.8, -8).topOnly = true;
}

function drawDoor(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  item: DoorGeometry,
  material: MaterialRef,
) {
  const f = item.frame;
  const blocked = e.room.doorHits.includes(item.id);
  const color = blocked ? BLOCKED_COLOR : '#cc8850';
  if (item.openAngle > 0)
    r.fill([item.hingePoint, ...item.arc], color, 0.16, ZONE_HEIGHT_CM, parent);
  r.line(
    item.arc.map((p) => [p.x, 1.2, p.z]),
    outline(r, color),
    parent,
  );
  r.line(segment(item.a, item.b, 1.3), 'dim', parent);
  const leafHeight = Math.min(item.height, s.roomFullWalls ? item.height : LOW_DOOR_LEAF_CM);
  const leaf = r.box(
    item.width,
    leafHeight,
    3.2,
    (item.hingePoint.x + item.tip.x) / 2,
    leafHeight / 2,
    (item.hingePoint.z + item.tip.z) / 2,
    blocked ? flat(r, BLOCKED_COLOR, 0.85) : material,
    parent,
  );
  const leafAngleDeg =
    (Math.atan2(-(item.tip.z - item.hingePoint.z), item.tip.x - item.hingePoint.x) * 180) / Math.PI;
  leaf.rotation = [0, degToRad(leafAngleDeg), 0];
  r.cylinder(2.4, 3, item.hingePoint.x, 1.5, item.hingePoint.z, 'orange', parent);
  const label = r.label(
    `${item.name.toUpperCase()} · ${item.openAngle}°${blocked ? ' · BLOCKED' : ''}`,
    item.center.x + f.nx * 10,
    2,
    item.center.z + f.nz * 10,
    true,
  );
  label.topOnly = true;
  label.className = 'room-object-label';
}

/** Sliding doors drawn on the wall, and the zone that must stay free in front of them. */
function drawWardrobeAccess(
  r: RenderList,
  parent: ParentRef,
  e: CockpitEvaluation,
  item: ReserveGeometry,
) {
  const f = item.frame;
  const occupied = e.room.accessHits.includes(item.id);
  const color = occupied ? BLOCKED_COLOR : '#7a8c64';
  const height = item.height;
  const front = r.group(parent, {
    position: [item.center.x - f.nx * 1.5, 0, item.center.z - f.nz * 1.5],
    rotation: [0, Math.atan2(-f.tz, f.tx), 0],
  });
  const panel = flat(r, '#c5bea5', 0.9);
  const edge = flat(r, '#6b705f');
  for (const side of [-1, 1]) {
    r.box(
      item.width / 2,
      height,
      1,
      (side * item.width) / 4,
      height / 2,
      side * 0.4,
      panel,
      front,
      true,
    );
    r.box(1.5, Math.min(14, height / 3), 1, side * 5, height / 2, 1, edge, front);
  }
  for (const y of [1, height - 1]) r.box(item.width, 2, 2, 0, y, 0, edge, front);
  r.line(segment(item.a, item.b, 1.4), outline(r, color), parent);
  if (item.clearance > 0) {
    r.fill(item.reserve, color, 0.13, ZONE_HEIGHT_CM, parent);
    r.line(closedLoop(item.reserve, 1.1), outline(r, color, 0.85), parent);
  }
  const status =
    item.clearance <= 0 ? '! CLEARANCE OFF' : occupied ? '! CHECK ACCESS' : '✓ ACCESS CLEAR';
  const labelOffset = Math.max(8, item.clearance / 2);
  const label = r.label(
    `${item.name.toUpperCase()} · ⇆ ${item.width} × ${item.height} cm · ${status}${item.clearance > 0 ? ` · ${item.clearance} cm in front` : ''}`,
    item.center.x + f.nx * labelOffset,
    2,
    item.center.z + f.nz * labelOffset,
    true,
  );
  label.topOnly = true;
  label.className = 'room-object-label';
}

function drawWindow(r: RenderList, parent: ParentRef, item: ReserveGeometry, glass: MaterialRef) {
  const f = item.frame;
  const middle = item.sill + item.height / 2;
  r.box(
    f.tx ? item.width : 3,
    item.height,
    f.tz ? item.width : 3,
    item.center.x,
    middle,
    item.center.z,
    glass,
    parent,
  );
  const frame = flat(r, '#6f9ca2');
  for (const side of [-1, 1])
    r.box(
      f.tx ? 2 : 5,
      item.height + 4,
      f.tz ? 2 : 5,
      item.center.x + (f.tx * side * item.width) / 2,
      middle,
      item.center.z + (f.tz * side * item.width) / 2,
      frame,
      parent,
    );
  for (const y of [item.sill, item.sill + item.height])
    r.box(
      f.tx ? item.width + 4 : 5,
      2,
      f.tz ? item.width + 4 : 5,
      item.center.x,
      y,
      item.center.z,
      frame,
      parent,
    );
  r.line(segment(item.a, item.b, 1.4), outline(r, '#538b97'), parent);
  if (item.clearance > 0) {
    r.fill(item.reserve, '#7dabb6', 0.12, ZONE_HEIGHT_CM, parent);
    r.line(closedLoop(item.reserve, 1), outline(r, '#7dabb6', 0.7), parent);
  }
  const label = r.label(
    `${item.name.toUpperCase()} · ${item.width} cm`,
    item.center.x + f.nx * 6,
    2,
    item.center.z + f.nz * 6,
    true,
  );
  label.topOnly = true;
  label.className = 'window-label';
}

function drawFurniture(
  r: RenderList,
  parent: ParentRef,
  e: CockpitEvaluation,
  item: FurnitureGeometry,
  materials: RoomMaterials,
) {
  const holder = r.group(parent, {
    position: [item.x, item.y0, item.z],
    rotation: [0, degToRad(item.angle), 0],
  });
  const W = item.width;
  const D = item.depth;
  const H = item.height;
  const interferes = e.room.collisions.includes(item.id);
  const body = interferes
    ? r.material({ kind: 'matte', color: '#b87b62', roughness: 0.9 })
    : materials.furniture;
  if (item.type === 'chair') drawChair(r, parent, holder, item, interferes, body);
  else if (item.type === 'wallShelf') {
    const thickness = Math.min(2, H / 2);
    r.box(W, thickness, D, 0, thickness / 2, 0, body, holder, true);
    if (H > 4) {
      for (const x of [-W / 2 + 1, W / 2 - 1]) r.box(2, H, D, x, H / 2, 0, body, holder, true);
      r.box(W, H, 1.5, 0, H / 2, -D / 2 + 0.75, body, holder);
      const levels = Math.max(1, Math.ceil(H / SHELF_LEVEL_SPACING_CM));
      for (let i = 1; i <= levels; i++)
        r.box(
          W,
          thickness,
          D,
          0,
          thickness / 2 + (i * (H - thickness)) / levels,
          0,
          body,
          holder,
          true,
        );
    }
  } else if (item.type === 'shelf') {
    for (const x of [-W / 2 + 1, W / 2 - 1]) r.box(2, H, D, x, H / 2, 0, body, holder, true);
    r.box(W, H, 1.5, 0, H / 2, D / 2 - 0.75, body, holder);
    const shelves = Math.max(2, Math.ceil(H / SHELF_LEVEL_SPACING_CM));
    for (let i = 0; i <= shelves; i++)
      r.box(W, 2, D, 0, 1 + (i * (H - 2)) / shelves, 0, body, holder, true);
    // A few books make the shelf recognizable in 3D without changing its footprint.
    for (let i = 0; i < Math.min(6, Math.floor(W / 10)); i++)
      r.box(4, 20, D * 0.6, -W / 2 + 8 + i * 7, 14, -D * 0.1, materials.furnitureDetail, holder);
  } else {
    const baseHeight = item.type === 'bed' ? H * 0.75 : H;
    r.box(W, baseHeight, D, 0, baseHeight / 2, 0, body, holder, true);
    if (item.type === 'bed') {
      r.box(W - 4, H * 0.2, D - 4, 0, H * 0.85, 0, 'fabric', holder);
      r.box(W * 0.7, H * 0.05, 25, 0, H * 0.975, -D / 2 + 20, 'wood', holder);
    } else {
      r.box(0.8, H * 0.85, 0.3, 0, H / 2, -D / 2 - 0.2, materials.furnitureDetail, holder);
      for (const x of [-3, 3])
        r.box(1, 8, 1, x, H * 0.53, -D / 2 - 1, materials.furnitureDetail, holder);
    }
  }
  const label = r.label(
    `${item.name.toUpperCase()} · ${item.width} × ${item.depth}${item.type === 'wallShelf' ? ` · WALL · BOTTOM ${item.elevation} cm` : ''}${interferes ? ' · ! INTERFERENCE' : ''}`,
    item.x,
    item.y1 + 6,
    item.z,
    true,
  );
  label.topOnly = true;
  label.className = 'room-object-label';
}

/** An office chair, its footprint and the space needed to pull it back. */
function drawChair(
  r: RenderList,
  room: ParentRef,
  holder: ParentRef,
  item: Chair,
  interferes: boolean,
  body: MaterialRef,
) {
  const W = item.width;
  const D = item.depth;
  const H = item.height;
  const seat = item.seatHeight;
  const upholstery = interferes ? body : 'fabric';
  const radius = Math.min(W, D) * 0.43;
  for (let i = 0; i < CHAIR_WHEELS; i++) {
    const a = (i / CHAIR_WHEELS) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    r.tube([0, 10, 0], [x, 6, z], 1.5, 'arm', holder);
    const wheel = r.cylinder(3, 2.8, x, 3.5, z, 'rubber', holder);
    wheel.rotation = [0, a, QUARTER_TURN];
  }
  r.cylinder(4.2, 4, 0, 10, 0, 'arm', holder);
  r.cylinder(1.8, seat - 14, 0, (seat + 8) / 2, 0, 'silver', holder);
  r.box(W * 0.72, 7, D * 0.7, 0, seat - 3.5, 0, upholstery, holder, true);
  r.box(W * 0.72, H - seat, 5, 0, seat + (H - seat) / 2, D * 0.3, upholstery, holder, true);
  r.box(W * 0.56, Math.min(18, (H - seat) * 0.4), 1, 0, H - 12, D * 0.3 - 3, 'seat', holder);
  for (const side of [-1, 1]) {
    r.box(2, 18, 2, side * W * 0.43, seat + 6, D * 0.1, 'arm', holder);
    r.box(3, 6, D * 0.55, side * W * 0.43, seat + 18, 0, upholstery, holder);
  }
  // A chevron on the seat points to the front of the chair.
  r.line(
    [
      [-5, seat + 0.2, -D * 0.22],
      [0, seat + 0.2, -D * 0.34],
      [5, seat + 0.2, -D * 0.22],
    ],
    outline(r, '#d1885d'),
    holder,
  );
  r.line(
    closedLoop(item.polygon, 0.9),
    outline(r, interferes ? BLOCKED_COLOR : '#9caa8c', 0.6),
    room,
  );
  if (item.reserve) {
    r.fill(item.reserve, '#8c9faa', 0.13, ZONE_HEIGHT_CM, room);
    r.line(closedLoop(item.reserve, 1.2), outline(r, '#879aa5', 0.8), room);
    const center = centroidOfFour(item.reserve);
    r.label(`CHAIR PULL-BACK · ${item.pullback} cm`, center.x, 2, center.z, true).topOnly = true;
  }
}
