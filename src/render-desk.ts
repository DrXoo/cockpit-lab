// The desk as drawn: tabletop, columns, desktop objects, the monitor and its arm.
// The desk and its objects are drawn in the desk frame; the monitor and arm in world coordinates.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad, overlapDepth, type PlanPoint, type Point3 } from './geometry.ts';
import { clampEdge } from './desk.ts';
import type { ParentRef, RenderList, Vec3 } from './render-list.ts';
import { profileBeam } from './render-profile.ts';

type DesktopItem = CockpitEvaluation['desktopItems'][number];

/** A monitor arm joint that can be dragged in the plan views. */
export interface ArmHandle {
  id: 'elbow' | 'end';
  label: string;
  point: Point3;
}

const QUARTER_TURN = Math.PI / 2;
const TABLETOP_THICKNESS_CM = 2.5;
/** Spacing of the plank grain lines on the tabletop. */
const GRAIN_SPACING_CM = 5;
const MAT_THICKNESS_CM = 0.35;
/** Overlap with the mat above which an object rests on it. */
const ON_MAT_OVERLAP_CM = 0.01;
const KEY_ROWS = 5;
const KEY_COLUMNS = 12;
/** Rotation of the clamp so that it grips the edge it is mounted on. */
const CLAMP_EDGE_ANGLE_DEG = { xmin: 0, xmax: 180, zmin: -90, zmax: 90 };
const REACH_CIRCLE_SEGMENTS = 64;
/** The gap between the arm's end and a monitor it cannot reach, drawn as a warning. */
const REACH_GAP_LINE = { kind: 'dashed', color: 0xc26a46, dashSize: 2, gapSize: 2 } as const;

export function drawDesk(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
): void {
  if (s.deskEnabled === false) return;
  const x = 0;
  const z = 0;
  const y = s.deskH;
  const b = e.deskBounds;
  r.box(
    s.deskDepth,
    TABLETOP_THICKNESS_CM,
    s.deskWidth,
    x,
    y - TABLETOP_THICKNESS_CM / 2,
    z,
    'wood',
    parent,
    true,
  );
  // Subtle plank grain, built from geometry so the viewer is self-contained.
  for (let i = 0; i < Math.floor(s.deskDepth / GRAIN_SPACING_CM); i++)
    r.box(
      0.06,
      0.04,
      s.deskWidth - 4,
      x - s.deskDepth / 2 + 3 + i * GRAIN_SPACING_CM,
      y + 0.02,
      z,
      'wood',
      parent,
    );
  profileBeam(r, parent, 'z', b.frameWidth - 10, x + 5, y - 8, z, '40x40');
  for (const columnZ of [z - b.columnZ, z + b.columnZ]) {
    r.box(66, 4.5, 8, x, 3.5, columnZ, 'desk', parent);
    r.box(9, y - 15, 8, x + 5, (y - 15) / 2 + 6, columnZ, 'desk', parent);
    r.box(10, 27, 9, x + 5, y - 25, columnZ, 'desk', parent);
    r.box(54, 3, 7, x - 4, y - 4, columnZ, 'desk', parent);
    for (const footX of [x - 27, x + 27])
      r.cylinder(2.4, 1.4, footX, 0.8, columnZ, 'rubber', parent);
  }
  drawDesktopObjects(r, parent, s, e);
}

/** The mat goes first so that the objects on it are drawn over it. */
function drawDesktopObjects(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
) {
  const mat = e.desktopItems.find((item) => item.id === 'mat');
  const matFirst = [...e.desktopItems].sort(
    (a, b) => (a.id === 'mat' ? -1 : 0) - (b.id === 'mat' ? -1 : 0),
  );
  for (const item of matFirst) {
    if (item.id === 'arm') continue;
    const onMat =
      !!mat &&
      item.id !== 'mat' &&
      overlapDepth(item.localPolygon, mat.localPolygon) > ON_MAT_OVERLAP_CM;
    const holder = r.group(parent, {
      position: [item.local.x, s.deskH + (onMat ? MAT_THICKNESS_CM : 0), item.local.z],
      rotation: [0, degToRad(item.local.angle), 0],
    });
    if (item.id === 'mat') drawMat(r, holder, item);
    if (item.id === 'keyboard') drawKeyboard(r, holder, item);
    if (item.id === 'mouse') drawMouse(r, holder);
    if (item.id === 'pc') drawPc(r, holder, item, s.pcHeight);
  }
}

function drawMat(r: RenderList, parent: ParentRef, { sizeX: X, sizeZ: Z }: DesktopItem) {
  const fabric = r.material({ kind: 'matte', color: 0x333c39, roughness: 1 });
  r.box(X, MAT_THICKNESS_CM, Z, 0, 0.2, 0, fabric, parent);
  const seam = r.material({ kind: 'line', color: 0x8a907b });
  r.line(
    [
      [-X / 2 + 0.6, 0.4, -Z / 2 + 0.6],
      [X / 2 - 0.6, 0.4, -Z / 2 + 0.6],
      [X / 2 - 0.6, 0.4, Z / 2 - 0.6],
      [-X / 2 + 0.6, 0.4, Z / 2 - 0.6],
      [-X / 2 + 0.6, 0.4, -Z / 2 + 0.6],
    ],
    seam,
    parent,
  );
  r.box(1.5, 0.08, 5.5, X / 2 - 2, 0.43, Z / 2 - 5, 'orange', parent);
}

function drawKeyboard(r: RenderList, parent: ParentRef, { sizeX: X, sizeZ: Z }: DesktopItem) {
  r.box(X, 1.8, Z, 0, 1.1, 0, 'dark', parent, true);
  const dx = (X - 1.8) / KEY_ROWS;
  const dz = (Z - 1.6) / KEY_COLUMNS;
  for (let row = 0; row < KEY_ROWS; row++)
    for (let col = 0; col < KEY_COLUMNS; col++)
      r.box(
        dx * 0.78,
        0.55,
        dz * 0.8,
        -X / 2 + 1.1 + row * dx,
        2.2,
        -Z / 2 + 1 + col * dz,
        row === 0 && col === 0 ? 'orange' : 'fabric',
        parent,
      );
  r.box(dx * 0.8, 0.58, dz * 4, -X / 2 + 1.1, 2.22, 0, 'groove', parent);
}

function drawMouse(r: RenderList, parent: ParentRef) {
  const shell = r.sphere(1, 0, 1.65, 0, 'dark', parent);
  shell.scale = [5.8, 1.65, 3.4];
  const ridge = r.material({ kind: 'line', color: 0x74816e });
  r.line(
    [
      [-0.2, 3.28, 0],
      [2.4, 3.05, 0],
      [4.4, 2.55, 0],
    ],
    ridge,
    parent,
  );
  const wheel = r.cylinder(0.65, 1, 1.5, 3.1, 0, 'rubber', parent);
  wheel.rotation = [QUARTER_TURN, 0, 0];
  r.box(0.8, 0.25, 1, -0.8, 3.23, 0, 'orange', parent);
}

function drawPc(r: RenderList, parent: ParentRef, { sizeX: X, sizeZ: Z }: DesktopItem, H: number) {
  r.box(X, H, Z, 0, H / 2, 0, 'dark', parent, true);
  r.box(0.3, H * 0.81, Z * 0.83, -X / 2 - 0.2, H * 0.51, 0, 'fabric', parent);
  for (let i = 0; i < 10; i++)
    r.box(0.15, 0.25, Z * 0.74, -X / 2 - 0.4, H * 0.12 + i * H * 0.075, 0, 'dark', parent);
  for (let i = 0; i < 7; i++)
    r.box(X * 0.76, 0.12, 0.25, 0, H + 0.07, -Z * 0.3 + i * Z * 0.1, 'groove', parent);
  r.sphere(0.35, X * 0.25, H + 0.2, -Z * 0.35, 'orange', parent);
  for (const footX of [-X * 0.35, X * 0.35])
    for (const footZ of [-Z * 0.35, Z * 0.35])
      r.cylinder(1, 0.7, footX, 0.35, footZ, 'rubber', parent);
}

/** Draws the arm and the monitor; returns the joints that can be dragged. */
export function drawMonitor(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  { showHandles }: { showHandles: boolean },
): ArmHandle[] {
  if (s.deskEnabled === false || s.monitorEnabled === false) return [];
  const p = e.clampPoint;
  const target = e.monitorPoint;
  const arm = e.armPose;
  const mid = arm.elbow;
  const actual = arm.end;
  drawArmAnchor(r, parent, s, p);
  r.cylinder(
    1.6,
    Math.max(8, target.y - s.deskH),
    p.x,
    (target.y + s.deskH) / 2,
    p.z,
    'arm',
    parent,
  );
  r.tube([p.x, target.y, p.z], [mid.x, target.y, mid.z], 1.4, 'arm', parent);
  r.tube([mid.x, target.y, mid.z], [actual.x, target.y, actual.z], 1.3, 'arm', parent);
  for (const joint of [{ x: p.x, z: p.z }, mid, actual])
    r.cylinder(2.7, 3, joint.x, target.y, joint.z, 'dark', parent);
  if (!arm.reachable)
    r.line(
      [
        [actual.x, target.y, actual.z],
        [target.x, target.y, target.z],
      ],
      r.material({ ...REACH_GAP_LINE }),
      parent,
    );
  const screen = r.group(parent, {
    position: [target.x, target.y, target.z],
    rotation: [0, degToRad(e.monitorAngle), 0],
  });
  r.box(e.monitorW, e.monitorH, 3.3, 0, 0, 0, 'dark', screen);
  r.box(e.monitorW - 1.8, e.monitorH - 1.8, 0.1, 0, 0.3, -1.72, 'screen', screen);
  r.box(4, 0.4, 0.3, 0, -e.monitorH / 2 + 0.5, -1.9, 'silver', screen);
  r.box(12, 12, 2, 0, 0, 3, 'arm', screen);
  const handles: ArmHandle[] = [
    { id: 'elbow', label: 'ELBOW', point: mid },
    { id: 'end', label: 'VESA', point: actual },
  ];
  if (showHandles)
    for (const { label, point } of handles) {
      r.sphere(3.8, point.x, point.y + 3, point.z, 'orange', parent);
      const tag = r.label(label, point.x, point.y + 7, point.z, true);
      tag.className = 'arm-joint-label';
      tag.offsetY = -20;
      tag.armHandle = true;
    }
  return handles;
}

function drawArmAnchor(r: RenderList, parent: ParentRef, s: CockpitConfig, p: PlanPoint) {
  const anchor = r.group(parent, {
    position: [p.x, s.deskH, p.z],
    rotation: [0, degToRad(s.deskAngle + CLAMP_EDGE_ANGLE_DEG[clampEdge(s)]), 0],
  });
  if (s.clampMount === 'clamp') {
    r.box(8, 2, 8, 0, 1, 0, 'arm', anchor);
    r.box(2, 8, 6, -6, -3, 0, 'dark', anchor);
    r.box(8, 1.5, 6, -3, -7, 0, 'dark', anchor);
    r.cylinder(0.6, 6, 0, -4, 0, 'silver', anchor);
  } else {
    r.cylinder(3.8, 1.2, 0, 0.6, 0, 'arm', anchor);
    r.cylinder(0.6, 7, 0, -3, 0, 'silver', anchor);
  }
}

/** The arm's horizontal reach, projected on the floor: a line to the monitor and a circle. */
export function drawArmReach(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  { visible }: { visible: boolean },
): void {
  if (s.deskEnabled === false || s.monitorEnabled === false) return;
  const p = e.clampPoint;
  const target = e.monitorPoint;
  const reach = r.group(parent, {}, { visible });
  r.line(
    [
      [p.x, 0.8, p.z],
      [target.x, 0.8, target.z],
    ],
    'dashed',
    reach,
  );
  const circle: Vec3[] = [];
  for (let i = 0; i <= REACH_CIRCLE_SEGMENTS; i++) {
    const a = (i / REACH_CIRCLE_SEGMENTS) * Math.PI * 2;
    circle.push([p.x + Math.cos(a) * s.armReach, 0.6, p.z + Math.sin(a) * s.armReach]);
  }
  r.line(circle, 'dashed', reach);
}
