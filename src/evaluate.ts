// Evaluates a room configuration: envelopes, interferences and the desk and room checks.
// Lengths are in cm. Volumes are approximate envelopes, not a structural model.
import {
  inversePoint,
  overlapDepth,
  rectangle,
  round,
  type PlanPoint,
  type Placement,
  type Point3,
  type Solid,
} from './geometry.ts';
import { evaluateRoom, type Obstacle, type RoomEvaluation } from './room.ts';
import type { NamedSolid } from './interference.ts';
import type { Check, CheckLevel } from './checks.ts';
import type { RoomConfig } from './config.ts';
import { deskBounds, getDesktopItems } from './desk.ts';
import { deskPose as deskPoseOf } from './layout.ts';
import { monitorGeometry } from './monitor-arm.ts';
import { deskAccessories } from './parts.ts';

// Tolerances. Below these values two volumes are in contact, not interfering.
/** The whole setup may stick out of the room by this much and still fit. */
const ROOM_FIT_TOLERANCE_CM = 0.01;
/** Minimum plan overlap between two hard items on the tabletop. */
const DESKTOP_OVERLAP_CM = 0.2;
/** The mouse may stick out of the mat by this much and still count as on it. */
const MAT_EDGE_TOLERANCE_CM = 0.01;
/** Maximum distance from the desk edge for a clamp-mounted arm to count as on the edge. */
const CLAMP_EDGE_TOLERANCE_CM = 0.1;
/** Minimum plan overlap for furniture or a door sweep to block the free aisle. */
const AISLE_OVERLAP_CM = 0.1;

const CM_PER_INCH = 2.54;
/** Monitors are modeled as ultrawide 21:9 screens. */
const MONITOR_ASPECT = { width: 21, height: 9 } as const;

export type CockpitEvaluation = ReturnType<typeof evaluate>;

interface Presence {
  hasDesk: boolean;
  hasMonitor: boolean;
}

type DesktopItem = ReturnType<typeof getDesktopItems>[number];

const named = (label: string, volume: Solid): NamedSolid => ({ ...volume, label });

const solid = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  placement: Placement,
): Solid => ({ polygon: rectangle(x0, x1, z0, z1, placement), y0, y1 });

const check = (
  id: string,
  label: string,
  value: string,
  level: CheckLevel,
  detail: string,
): Check => ({ id, label, value, level, detail });

function presenceOf(s: RoomConfig): Presence {
  const hasDesk = s.deskEnabled !== false;
  return { hasDesk, hasMonitor: hasDesk && s.monitorEnabled !== false };
}

function monitorSize(inches: number) {
  const diagonal = Math.hypot(MONITOR_ASPECT.width, MONITOR_ASPECT.height);
  return {
    monitorW: (inches * CM_PER_INCH * MONITOR_ASPECT.width) / diagonal,
    monitorH: (inches * CM_PER_INCH * MONITOR_ASPECT.height) / diagonal,
  };
}

/** Bounding box of every point of the setup and its clearance to each room wall. */
function setupExtent(s: RoomConfig, setupPoints: PlanPoint[]) {
  const points = setupPoints.length ? setupPoints : [{ x: s.roomX, z: s.roomZ }];
  const allLeft = Math.min(...points.map((p) => p.x));
  const allRight = Math.max(...points.map((p) => p.x));
  const allBack = Math.min(...points.map((p) => p.z));
  const allFront = Math.max(...points.map((p) => p.z));
  const spaceW = allRight - allLeft;
  const spaceD = allFront - allBack;
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
  return {
    allLeft,
    allRight,
    allBack,
    allFront,
    spaceW,
    spaceD,
    freeW: s.roomW - spaceW,
    freeD: s.roomD - spaceD,
    roomBounds,
    clearances,
    roomFits: Object.values(clearances).every((gap) => gap >= -ROOM_FIT_TOLERANCE_CM),
  };
}

/** Tabletop, two columns and two feet. */
function deskVolumes(
  s: RoomConfig,
  bounds: ReturnType<typeof deskBounds>,
  deskPose: Placement,
): NamedSolid[] {
  const volumes = [
    named(
      'Desktop',
      solid(
        -bounds.halfX,
        bounds.halfX,
        -bounds.halfZ,
        bounds.halfZ,
        s.deskH - 2.5,
        s.deskH,
        deskPose,
      ),
    ),
  ];
  for (const z of [-bounds.columnZ, bounds.columnZ]) {
    volumes.push(named('Desk column', solid(0, 10, z - 4.5, z + 4.5, 6, s.deskH - 4, deskPose)));
    volumes.push(named('Desk foot', solid(-33, 33, z - 4, z + 4, 1, 6, deskPose)));
  }
  return volumes;
}

/** The monitor arm's reach and height, and the monitor parked for VR. */
function spaceChecks(
  s: RoomConfig,
  presence: Presence,
  layout: {
    armPose: ReturnType<typeof monitorGeometry>['arm'];
    reach: number;
    lift: number;
  },
): Check[] {
  const { armPose, reach, lift } = layout;
  if (!presence.hasMonitor) return [];
  const checks = [
    check(
      'arm',
      'Monitor arm',
      armPose.reachable ? (s.monitorMode === 'manual' ? 'Manual' : 'Reaches') : 'Out of reach',
      !armPose.reachable ? 'error' : reach > armPose.maxReach * 0.9 ? 'warning' : 'ok',
      `${Math.round(reach)} cm in the plan · range ${round(armPose.minReach)}–${round(armPose.maxReach)} cm; segments ${round(armPose.first)} + ${round(armPose.second)} cm`,
    ),
    check(
      'lift',
      'Arm height',
      `${Math.round(lift)} cm`,
      lift < s.armMinH || lift > s.armMaxH ? 'error' : 'ok',
      `VESA center above the desktop · ${s.armMinH}–${s.armMaxH} cm`,
    ),
  ];
  if (s.monitorMode === 'vr')
    checks.push(check('vr', 'VR mode', 'Front clear', 'ok', 'Monitor parked over the desk'));
  return checks;
}

/** Overlaps between hard tabletop items, and whether the mouse sits on the mat. */
function desktopLayout(desktopItems: DesktopItem[]) {
  const hardItems = desktopItems.filter((item) => item.id !== 'mat');
  const desktopOverlaps: string[] = [];
  for (let i = 0; i < hardItems.length; i++)
    for (let j = i + 1; j < hardItems.length; j++)
      if (overlapDepth(hardItems[i].localPolygon, hardItems[j].localPolygon) > DESKTOP_OVERLAP_CM)
        desktopOverlaps.push(`${hardItems[i].label} / ${hardItems[j].label}`);
  const mat = desktopItems.find((item) => item.id === 'mat');
  const mouse = desktopItems.find((item) => item.id === 'mouse');
  const mouseOnMat =
    !!mat &&
    !!mouse &&
    mouse.localPolygon.every((p) => {
      const local = inversePoint(p, mat.local);
      return (
        Math.abs(local.x) <= mat.sizeX / 2 + MAT_EDGE_TOLERANCE_CM &&
        Math.abs(local.z) <= mat.sizeZ / 2 + MAT_EDGE_TOLERANCE_CM
      );
    });
  return { desktopOverlaps, mouseOnMat, hasMatAndMouse: !!mat && !!mouse };
}

function desktopChecks(
  s: RoomConfig,
  presence: Presence,
  desktopItems: DesktopItem[],
  layout: ReturnType<typeof desktopLayout>,
  bounds: ReturnType<typeof deskBounds>,
): Check[] {
  if (!presence.hasDesk) return [];
  const { desktopOverlaps, mouseOnMat } = layout;
  const outsideItems = desktopItems.filter((item) => item.outside);
  const checks = [
    check(
      'desktop-fit',
      'On the desktop',
      outsideItems.length ? 'Check the edges' : 'All on it',
      outsideItems.length ? 'warning' : 'ok',
      outsideItems.length
        ? outsideItems.map((item) => item.label).join(', ')
        : `Envelopes and rotations on ${s.deskWidth} × ${s.deskDepth} cm`,
    ),
    check(
      'desktop-overlap',
      'Items on the desk',
      desktopOverlaps.length
        ? `${desktopOverlaps.length} overlap${desktopOverlaps.length > 1 ? 's' : ''}`
        : 'No overlaps',
      desktopOverlaps.length ? 'warning' : 'ok',
      desktopOverlaps.length ? desktopOverlaps.join(' · ') : 'Items may rest on the desk mat',
    ),
  ];
  if (layout.hasMatAndMouse)
    checks.push(
      check(
        'mouse-mat',
        'Mouse and desk mat',
        mouseOnMat ? 'On it' : 'Off it',
        mouseOnMat ? 'ok' : 'warning',
        `${s.matWidth} × ${s.matDepth} cm · mouse coverage`,
      ),
    );
  if (presence.hasMonitor) {
    const edgeDistance = Math.min(
      Math.abs(s.clampX + bounds.anchorX),
      Math.abs(s.clampX - bounds.anchorX),
      Math.abs(s.clampZ + bounds.anchorZ),
      Math.abs(s.clampZ - bounds.anchorZ),
    );
    const onEdge = edgeDistance < CLAMP_EDGE_TOLERANCE_CM;
    checks.push(
      check(
        'mount',
        'Arm mount',
        s.clampMount === 'grommet' ? 'Grommet' : onEdge ? 'On the edge' : 'Check',
        s.clampMount === 'clamp' && !onEdge ? 'warning' : 'ok',
        s.clampMount === 'grommet'
          ? 'Needs a drilled hole or a compatible cable grommet'
          : 'Edge clamp · check compatibility',
      ),
    );
  }
  return checks;
}

/** A thin prism along a monitor arm segment, at the monitor height. */
function segmentVolume(a: PlanPoint, b: PlanPoint, radius: number, y: number): Solid {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const angle = (Math.atan2(-(b.z - a.z), b.x - a.x) * 180) / Math.PI;
  return solid(-length / 2, length / 2, -radius, radius, y - 3, y + 3, {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    angle,
  });
}

/** Everything of the setup that can block furniture, openings and clearance zones. */
function setupObstacles(
  s: RoomConfig,
  presence: Presence,
  parts: {
    deskSolids: NamedSolid[];
    desktopItems: DesktopItem[];
    monitorPolygon: Point3[];
    monitorH: number;
    monitor: ReturnType<typeof monitorGeometry>;
  },
): Obstacle[] {
  const { deskSolids, desktopItems, monitorPolygon, monitorH, monitor } = parts;
  const obstacles: Obstacle[] = [
    ...deskSolids.map((volume) => ({ ...volume, label: 'Desk', part: volume.label })),
    ...desktopItems
      .filter((item) => item.id !== 'mat')
      .map((item) => ({
        polygon: item.polygon,
        y0: s.deskH,
        y1: s.deskH + item.height,
        label: item.label,
      })),
  ];
  if (!presence.hasMonitor) return obstacles;
  const arm = monitor.arm;
  return [
    ...obstacles,
    {
      polygon: monitorPolygon,
      y0: s.monitorH - monitorH / 2,
      y1: s.monitorH + monitorH / 2,
      label: 'Monitor',
    },
    ...[
      [monitor.anchor, arm.elbow],
      [arm.elbow, arm.end],
    ].map(([a, b]) => ({ ...segmentVolume(a, b, 1.5, s.monitorH), label: 'Monitor arm' })),
  ];
}

/** The first side of the setup with an aisle free of furniture and door sweeps. */
function findFreeBand(
  s: RoomConfig,
  extent: ReturnType<typeof setupExtent>,
  hasSetup: boolean,
  room: RoomEvaluation,
) {
  const { allLeft, allRight, allBack, allFront } = extent;
  const origin = { x: 0, z: 0, angle: 0 };
  const bandOn = (side: string) =>
    side === 'left'
      ? rectangle(allLeft - s.aisle, allLeft, allBack, allFront, origin)
      : side === 'right'
        ? rectangle(allRight, allRight + s.aisle, allBack, allFront, origin)
        : side === 'back'
          ? rectangle(allLeft, allRight, allBack - s.aisle, allBack, origin)
          : rectangle(allLeft, allRight, allFront, allFront + s.aisle, origin);
  const candidates = (hasSetup ? Object.entries(extent.clearances) : [])
    .filter(([, gap]) => gap >= s.aisle)
    .map(([side]) => ({ side, polygon: bandOn(side) }));
  const doors = room.features.filter((feature) => feature.type === 'door');
  return candidates.find(
    (band) =>
      !room.furniture.some((item) => overlapDepth(band.polygon, item.polygon) > AISLE_OVERLAP_CM) &&
      !doors.some((door) =>
        door.sectors.some((sector) => overlapDepth(band.polygon, sector) > AISLE_OVERLAP_CM),
      ),
  );
}

/** Whether the setup fits in the room with a free aisle beside it. */
function roomFitChecks(
  s: RoomConfig,
  room: { hasSetup: boolean; roomFits: boolean; aisleFits: boolean },
): Check[] {
  if (!room.hasSetup || s.roomEnabled === false) return [];
  return [
    room.roomFits
      ? check(
          'room',
          'Side clearance',
          room.aisleFits ? `${s.aisle} cm available` : 'Not enough',
          room.aisleFits ? 'ok' : 'warning',
          'A band free of furniture and door swings; does not check a way in',
        )
      : check(
          'room',
          'Available area',
          'Outside the area',
          'error',
          'Move the items or adjust the origin and size of the area',
        ),
  ];
}

export function evaluate(s: RoomConfig) {
  const presence = presenceOf(s);
  const { hasDesk, hasMonitor } = presence;
  const deskPose = deskPoseOf(s);

  const bounds = deskBounds(s);
  const deskLeft = -bounds.halfX;
  const deskRight = bounds.halfX;
  const deskBack = -bounds.halfZ;
  const deskFront = bounds.halfZ;

  const { monitorW, monitorH } = monitorSize(s.monitorInches);
  const monitor = monitorGeometry(s);
  const clampPoint = monitor.anchor;
  const monitorPoint = monitor.point;
  const monitorAngle = monitor.angle;
  const armPose = monitor.arm;
  const reach = Math.hypot(clampPoint.x - monitorPoint.x, clampPoint.z - monitorPoint.z);
  const lift = s.monitorH - s.deskH;

  const deskPolygon = hasDesk
    ? rectangle(-bounds.footprintHalfX, bounds.footprintHalfX, deskBack, deskFront, deskPose)
    : [];
  const tabletopPolygon = hasDesk
    ? rectangle(deskLeft, deskRight, deskBack, deskFront, deskPose)
    : [];
  const monitorPolygon = hasMonitor
    ? rectangle(-monitorW / 2, monitorW / 2, -2, 2, { ...monitorPoint, angle: monitorAngle })
    : [];
  const desktopItems = getDesktopItems(s);
  const setupPoints: PlanPoint[] = [
    ...deskPolygon,
    ...monitorPolygon,
    ...desktopItems.flatMap((item) => item.polygon),
    ...(hasMonitor ? [armPose.elbow, armPose.end] : []),
  ];
  const hasSetup = setupPoints.length > 0;
  const extent = setupExtent(s, setupPoints);
  const deskSolids = hasDesk ? deskVolumes(s, bounds, deskPose) : [];

  const desktop = desktopLayout(desktopItems);
  const room = evaluateRoom(
    s,
    setupObstacles(s, presence, { deskSolids, desktopItems, monitorPolygon, monitorH, monitor }),
  );
  const freeBand = findFreeBand(s, extent, hasSetup, room);
  const aisleFits = extent.roomFits && !!freeBand;

  const spaceCheck = spaceChecks(s, presence, { armPose, reach, lift });
  const deskCheck = desktopChecks(s, presence, desktopItems, desktop, bounds);
  const extra = roomFitChecks(s, { hasSetup, roomFits: extent.roomFits, aisleFits });
  const checks = [...spaceCheck, ...deskCheck, ...extra, ...room.checks];

  return {
    spaceCheck,
    desktopChecks: deskCheck,
    desktopItems,
    desktopOverlaps: desktop.desktopOverlaps,
    mouseOnMat: desktop.mouseOnMat,
    extra,
    checks,
    errors: checks.filter((c) => c.level === 'error').length,
    warnings: checks.filter((c) => c.level === 'warning').length,
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
    spaceW: extent.spaceW,
    spaceD: extent.spaceD,
    allLeft: extent.allLeft,
    allRight: extent.allRight,
    allBack: extent.allBack,
    allFront: extent.allFront,
    freeW: extent.freeW,
    freeD: extent.freeD,
    deskPose,
    deskPolygon,
    tabletopPolygon,
    deskBounds: bounds,
    monitorAngle,
    armPose,
    roomFits: extent.roomFits,
    roomBounds: extent.roomBounds,
    clearances: extent.clearances,
    aisleFits,
    freeBand,
    room,
    /** Desk accessories to buy. */
    accessories: deskAccessories(s),
  };
}
