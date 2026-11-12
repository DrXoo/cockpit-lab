// Evaluates a configuration: envelopes, interferences and ergonomic and room checks.
// Lengths are in cm. Volumes are approximate envelopes, not a structural model.
import {
  degToRad,
  inversePoint,
  overlapDepth,
  polygonDistance,
  rectangle,
  round,
  transformPoint,
  type PlanPoint,
  type Placement,
  type Point3,
  type Solid,
} from './geometry.ts';
import { evaluateRoom, type Obstacle, type RoomEvaluation } from './room.ts';
import type { Check, CheckLevel } from './checks.ts';
import type { CockpitConfig } from './config.ts';
import { anatomy } from './anatomy.ts';
import { deskBounds, getDesktopItems } from './desk.ts';
import { pose } from './layout.ts';
import { monitorGeometry } from './monitor-arm.ts';
import { getParts } from './parts.ts';
import { baseSupports, drivingMount, floorHeight, rigLift } from './rig.ts';

// Tolerances. Below these values two volumes are in contact, not interfering.
/** Minimum vertical and plan overlap for a rig volume to interfere with the desk. */
const RIG_DESK_OVERLAP_CM = 0.1;
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
  hasRig: boolean;
  hasDesk: boolean;
  hasMonitor: boolean;
  /** A shifter or handbrake is mounted on the rig. */
  hasDriving: boolean;
}

type DrivingMount = ReturnType<typeof drivingMount>;
type Body = ReturnType<typeof anatomy>;
type DesktopItem = ReturnType<typeof getDesktopItems>[number];

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

function presenceOf(s: CockpitConfig): Presence {
  const hasRig = s.cockpitEnabled !== false;
  const hasDesk = s.deskEnabled !== false;
  return {
    hasRig,
    hasDesk,
    hasMonitor: hasDesk && s.monitorEnabled !== false,
    hasDriving: hasRig && (s.shifter || s.handbrake),
  };
}

function monitorSize(inches: number) {
  const diagonal = Math.hypot(MONITOR_ASPECT.width, MONITOR_ASPECT.height);
  return {
    monitorW: (inches * CM_PER_INCH * MONITOR_ASPECT.width) / diagonal,
    monitorH: (inches * CM_PER_INCH * MONITOR_ASPECT.height) / diagonal,
  };
}

/** Plan footprint of the rig, including side mounts, the pedals and a reclined backrest. */
function rigFootprint(s: CockpitConfig, presence: Presence, driving: DrivingMount) {
  const flightExtra = s.hotas ? s.hotasOut + 9 : 0;
  const drivingExtra = presence.hasDriving ? s.hotasOut + 10 : 0;
  const rigLeft = -s.width / 2 - Math.max(flightExtra, driving.sign < 0 ? drivingExtra : 0);
  const rigRight = s.width / 2 + Math.max(flightExtra, driving.sign > 0 ? drivingExtra : 0);
  const pedalEnd = s.pedalZ + 18 * Math.cos(degToRad(s.pedalTilt));
  const seatBackZ =
    s.seatZ - 12 - Math.sin(degToRad(s.recline)) * 64 - Math.cos(degToRad(s.recline)) * 4.5;
  const lowerZ = Math.min(0, seatBackZ);
  const upperZ = Math.max(s.length, pedalEnd, s.wheel ? s.wheelZ + 32 : 0);
  return {
    rigLeft,
    rigRight,
    pedalEnd,
    overhang: pedalEnd > s.length,
    seatBackZ,
    lowerZ,
    upperZ,
  };
}

/** Bounding box of every point of the setup and its clearance to each room wall. */
function setupExtent(s: CockpitConfig, setupPoints: PlanPoint[]) {
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

/** Volumes of the chassis, seat, pedals and controls, raised by the base elevation. */
function rigVolumes(
  s: CockpitConfig,
  presence: Presence,
  driving: DrivingMount,
  seatBackZ: number,
  rigPose: Placement,
): Solid[] {
  if (!presence.hasRig) return baseSupportVolumes(s, rigPose);
  const volumes = [
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
  ];
  if (s.wheel) {
    volumes.push(
      solid(-16, 16, s.wheelZ - 3, s.wheelZ + 32, s.wheelH - 10, s.wheelH + 16, rigPose),
    );
    for (const sign of [-1, 1]) {
      const x = sign * (s.width / 2 - 2);
      volumes.push(solid(x - 4, x + 4, s.wheelZ + 15, s.wheelZ + 21, 14, s.wheelH - 8, rigPose));
    }
  }
  if (s.hotas)
    for (const sign of [-1, 1]) {
      const x = sign * (s.width / 2 + s.hotasOut);
      const z = s.hotasZ + (sign === driving.sign && presence.hasDriving ? 24 : 0);
      volumes.push(solid(x - 9, x + 9, z - 12.5, z + 12.5, s.hotasH - 4, s.hotasH + 22, rigPose));
    }
  if (presence.hasDriving) {
    const { x, z } = driving;
    volumes.push(solid(x - 10, x + 10, z - 15, z + 15, s.hotasH - 4, s.hotasH + 25, rigPose));
  }
  if (s.centerStick)
    volumes.push(solid(-9, 9, s.stickZ - 10, s.stickZ + 10, s.stickH - 3, s.stickH + 22, rigPose));
  for (const volume of volumes) {
    volume.y0 += rigLift(s);
    volume.y1 += rigLift(s);
  }
  return [...volumes, ...baseSupportVolumes(s, rigPose)];
}

/** The base extensions already sit at their final height. */
function baseSupportVolumes(s: CockpitConfig, rigPose: Placement): Solid[] {
  return baseSupports(s).map((p) =>
    solid(p.x - 2, p.x + 2, p.z - 2, p.z + 2, p.y - p.length / 2, p.y + p.length / 2, rigPose),
  );
}

/** Tabletop, two columns and two feet. */
function deskVolumes(
  s: CockpitConfig,
  bounds: ReturnType<typeof deskBounds>,
  deskPose: Placement,
): Solid[] {
  const volumes = [
    solid(
      -bounds.halfX,
      bounds.halfX,
      -bounds.halfZ,
      bounds.halfZ,
      s.deskH - 2.5,
      s.deskH,
      deskPose,
    ),
  ];
  for (const z of [-bounds.columnZ, bounds.columnZ]) {
    volumes.push(solid(0, 10, z - 4.5, z + 4.5, 6, s.deskH - 4, deskPose));
    volumes.push(solid(-33, 33, z - 4, z + 4, 1, 6, deskPose));
  }
  return volumes;
}

function countCollisions(a: Solid[], b: Solid[]): number {
  let count = 0;
  for (const x of a)
    for (const y of b)
      if (
        Math.min(x.y1, y.y1) - Math.max(x.y0, y.y0) > RIG_DESK_OVERLAP_CM &&
        overlapDepth(x.polygon, y.polygon) > RIG_DESK_OVERLAP_CM
      )
        count++;
  return count;
}

/** Joint angles and reach, against approximate comfort guides for average proportions. */
function bodyChecks(
  s: CockpitConfig,
  body: Body,
  presence: Presence,
  monitorPoint: Point3,
  rigPose: Placement,
): Check[] {
  if (!presence.hasRig) return [];
  const checks = [
    check(
      'knee',
      'Knee angle',
      body.legs.reachable ? `${Math.round(body.legs.angle)}°` : 'Out of reach',
      !body.legs.reachable
        ? 'error'
        : body.legs.angle < 100 || body.legs.angle > 145
          ? 'warning'
          : 'ok',
      'Guide 100–145° · average proportions',
    ),
    check(
      'hip',
      'Hip angle',
      `${Math.round(body.hipAngle)}°`,
      body.hipAngle < 85 || body.hipAngle > 125 ? 'warning' : 'ok',
      'Guide 85–125° · backrest included',
    ),
  ];
  if (s.wheel)
    checks.push(
      check(
        'elbow',
        'Elbow angle',
        body.arms.reachable ? `${Math.round(body.arms.angle)}°` : 'Out of reach',
        !body.arms.reachable
          ? 'error'
          : body.arms.angle < 85 || body.arms.angle > 140
            ? 'warning'
            : 'ok',
        'Guide 85–140° · side grip',
      ),
    );
  if (s.hotas) {
    const distance = Math.hypot(
      s.hotasZ - body.shoulder.z,
      s.hotasH + 18 - body.shoulder.y,
      s.width / 2 + s.hotasOut - 18,
    );
    checks.push(
      check(
        'hotas',
        'HOTAS reach',
        `${Math.round(distance)} cm`,
        distance > s.height * 0.332 ? 'error' : distance > s.height * 0.3 ? 'warning' : 'ok',
        'Shoulder to grip · approximate',
      ),
    );
  }
  if (s.centerStick) {
    const distance = Math.hypot(s.stickZ - body.shoulder.z, s.stickH + 14 - body.shoulder.y);
    checks.push(
      check(
        'stick',
        'Center stick',
        `${Math.round(distance)} cm`,
        distance > s.height * 0.332 ? 'error' : 'ok',
        'Shoulder to grip · approximate',
      ),
    );
  }
  if (presence.hasMonitor && s.monitorMode === 'cockpit') {
    const eye = transformPoint({ x: 0, ...body.eye, y: body.eye.y + rigLift(s) }, rigPose);
    const distance = Math.hypot(
      monitorPoint.x - eye.x,
      monitorPoint.z - eye.z,
      monitorPoint.y - eye.y,
    );
    checks.push(
      check(
        'eyes',
        'Eyes to screen',
        `${Math.round(distance)} cm`,
        distance < 50 || distance > 110 ? 'warning' : 'ok',
        'Straight-line distance · guide 50–110 cm',
      ),
    );
  }
  return checks;
}

/** Rig-to-desk separation, interferences and the monitor arm. */
function spaceChecks(
  s: CockpitConfig,
  presence: Presence,
  layout: {
    sideGap: number;
    collisionCount: number;
    armPose: ReturnType<typeof monitorGeometry>['arm'];
    reach: number;
    lift: number;
    monitorH: number;
  },
): Check[] {
  const { sideGap, collisionCount, armPose, reach, lift, monitorH } = layout;
  const checks: Check[] = [];
  if (presence.hasRig && presence.hasDesk) {
    checks.push(
      check(
        'side',
        'Gap in the plan',
        sideGap < 0 ? `${Math.ceil(-sideGap)} cm overlap` : `${Math.round(sideGap)} cm`,
        sideGap < 5 ? 'warning' : 'ok',
        sideGap < 0
          ? 'Footprints overlap; check the heights'
          : 'Smallest distance between the rotated footprints',
      ),
      check(
        'collision',
        'Interference',
        collisionCount > 0
          ? `${collisionCount} clash${collisionCount > 1 ? 'es' : ''}`
          : 'No clash',
        collisionCount > 0 ? 'error' : 'ok',
        'Approximate volumes · rotation included',
      ),
    );
  }
  if (!presence.hasMonitor) return checks;
  checks.push(
    check(
      'arm',
      'Monitor arm',
      armPose.reachable ? (s.monitorMode === 'manual' ? 'Manual' : 'Reaches') : 'Out of reach',
      !armPose.reachable ? 'error' : reach > s.armReach * 0.9 ? 'warning' : 'ok',
      `${Math.round(reach)} cm in the plan · range ${round(armPose.minReach)}–${s.armReach} cm; segments ${round(armPose.first)} + ${round(armPose.second)} cm`,
    ),
    check(
      'lift',
      'Arm height',
      `${Math.round(lift)} cm`,
      lift < s.armMinH || lift > s.armMaxH ? 'error' : 'ok',
      `VESA center above the desktop · ${s.armMinH}–${s.armMaxH} cm`,
    ),
  );
  if (s.monitorMode === 'cockpit' && presence.hasRig) {
    const monitorClearance = s.monitorH - monitorH / 2 - (floorHeight(s, 'wheelH') + 16);
    checks.push(
      check(
        'screen',
        'Screen / wheel',
        s.wheel ? `${Math.round(monitorClearance)} cm` : 'Clear',
        s.wheel && monitorClearance < 2 ? 'warning' : 'ok',
        'Vertical gap between envelopes',
      ),
    );
  }
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
  s: CockpitConfig,
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
  s: CockpitConfig,
  presence: Presence,
  parts: {
    rigSolids: Solid[];
    deskSolids: Solid[];
    desktopItems: DesktopItem[];
    monitorPolygon: Point3[];
    monitorH: number;
    monitor: ReturnType<typeof monitorGeometry>;
  },
): Obstacle[] {
  const { rigSolids, deskSolids, desktopItems, monitorPolygon, monitorH, monitor } = parts;
  const obstacles: Obstacle[] = [
    ...rigSolids.map((volume) => ({ ...volume, label: 'Cockpit' })),
    ...deskSolids.map((volume) => ({ ...volume, label: 'Desk' })),
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
  s: CockpitConfig,
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

function otherChecks(
  s: CockpitConfig,
  presence: Presence,
  rig: ReturnType<typeof rigFootprint>,
  room: { hasSetup: boolean; roomFits: boolean; aisleFits: boolean },
): Check[] {
  const checks: Check[] = [];
  if (presence.hasRig && rig.overhang)
    checks.push(
      check(
        'overhang',
        'Pedals',
        `Sticks out ${Math.ceil(rig.pedalEnd - s.length)} cm`,
        'error',
        'Lengthen the chassis or move the pedals back',
      ),
    );
  if (presence.hasRig && rig.seatBackZ < 0)
    checks.push(
      check(
        'seatback',
        'Backrest',
        `Sticks out ${Math.ceil(-rig.seatBackZ)} cm`,
        'warning',
        'The setup footprint includes this overhang',
      ),
    );
  if (room.hasSetup && s.roomEnabled !== false)
    checks.push(
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
    );
  if (presence.hasRig && s.centerStick && s.wheel && Math.abs(s.stickZ - s.wheelZ) < 24)
    checks.push(
      check(
        'mode',
        'Center controls',
        'Check the mounting',
        'warning',
        'The stick and the wheel share the same space: fit one at a time',
      ),
    );
  return checks;
}

export function evaluate(s: CockpitConfig) {
  const presence = presenceOf(s);
  const { hasRig, hasDesk, hasMonitor } = presence;
  const body = anatomy(s);
  const driving = drivingMount(s);
  const rigPose = pose(s, 'cockpit');
  const deskPose = pose(s, 'desk');
  const rig = rigFootprint(s, presence, driving);
  const { rigLeft, rigRight, lowerZ, upperZ } = rig;

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

  const rigPolygon = hasRig ? rectangle(rigLeft, rigRight, lowerZ, upperZ, rigPose) : [];
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
    ...rigPolygon,
    ...deskPolygon,
    ...monitorPolygon,
    ...desktopItems.flatMap((item) => item.polygon),
    ...(hasMonitor ? [armPose.elbow, armPose.end] : []),
  ];
  const hasSetup = setupPoints.length > 0;
  const extent = setupExtent(s, setupPoints);
  const sideGap = hasRig && hasDesk ? polygonDistance(rigPolygon, deskPolygon) : 0;

  const rigSolids = rigVolumes(s, presence, driving, rig.seatBackZ, rigPose);
  const deskSolids = hasDesk ? deskVolumes(s, bounds, deskPose) : [];
  const collisionCount = countCollisions(rigSolids, deskSolids);

  const desktop = desktopLayout(desktopItems);
  const room = evaluateRoom(
    s,
    setupObstacles(s, presence, {
      rigSolids,
      deskSolids,
      desktopItems,
      monitorPolygon,
      monitorH,
      monitor,
    }),
  );
  const freeBand = findFreeBand(s, extent, hasSetup, room);
  const aisleFits = extent.roomFits && !!freeBand;

  const bodyCheck = bodyChecks(s, body, presence, monitorPoint, rigPose);
  const spaceCheck = spaceChecks(s, presence, {
    sideGap,
    collisionCount,
    armPose,
    reach,
    lift,
    monitorH,
  });
  const deskCheck = desktopChecks(s, presence, desktopItems, desktop, bounds);
  const extra = otherChecks(s, presence, rig, { hasSetup, roomFits: extent.roomFits, aisleFits });
  const checks = [...bodyCheck, ...spaceCheck, ...deskCheck, ...extra, ...room.checks];

  return {
    body: hasRig ? body : null,
    bodyCheck,
    spaceCheck,
    desktopChecks: deskCheck,
    desktopItems,
    desktopOverlaps: desktop.desktopOverlaps,
    mouseOnMat: desktop.mouseOnMat,
    extra,
    checks,
    errors: checks.filter((c) => c.level === 'error').length,
    warnings: checks.filter((c) => c.level === 'warning').length,
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
    spaceW: extent.spaceW,
    spaceD: extent.spaceD,
    allLeft: extent.allLeft,
    allRight: extent.allRight,
    allBack: extent.allBack,
    allFront: extent.allFront,
    freeW: extent.freeW,
    freeD: extent.freeD,
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
    roomFits: extent.roomFits,
    roomBounds: extent.roomBounds,
    clearances: extent.clearances,
    aisleFits,
    freeBand,
    room,
    ...getParts(s),
  };
}
