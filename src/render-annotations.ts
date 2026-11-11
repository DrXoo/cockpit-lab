// Measurements and labels drawn over the setup, and the outline of the selected item.
// Labels are positioned in world coordinates, whatever group their lines belong to.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad, transformPoint, type Placement, type PlanPoint } from './geometry.ts';
import type { ParentRef, RenderList, SceneLabel } from './render-list.ts';
import { floorHeight, rigLift } from './rig.ts';
import type { SceneView } from './scene-camera.ts';

export interface LayoutSelection {
  view: SceneView;
  layoutEditing: boolean;
  /** `cockpit`, `desk`, a desktop item id, `furniture:<id>` or `feature:<id>`. */
  layoutTarget: string;
}

/** Height of the plan measurements above the floor. */
const PLAN_HEIGHT_CM = 0.8;
const SELECTION_COLOR = 0xd96236;

const isPlanView = (view: SceneView) => view === 'top' || view === 'desk';

/** Moves the labels drawn since `first` from a local frame into the world. */
function placeLabels(labels: SceneLabel[], first: number, placement: Placement) {
  for (const label of labels.slice(first))
    label.position = transformPoint(label.position, placement);
}

/** Length and width on the plan, and the heights that only make sense from the side. */
export function drawRigDimensions(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  view: SceneView,
): void {
  const enabled = s.cockpitEnabled !== false;
  const rig = r.group(
    parent,
    enabled
      ? { position: [s.cockpitX, 0, s.cockpitZ], rotation: [0, degToRad(s.cockpitAngle), 0] }
      : {},
  );
  if (!enabled) return;
  const first = r.labels.length;
  const w = s.width;
  const l = s.length;
  const left = -w / 2 - 20;
  const y = PLAN_HEIGHT_CM;
  r.dimension([left, y, 0], [left, y, l], `${l} cm`, [-2, 0, 0], rig);
  r.line(
    [
      [-w / 2, y, 0],
      [left - 4, y, 0],
    ],
    'dim',
    rig,
  );
  r.line(
    [
      [-w / 2, y, l],
      [left - 4, y, l],
    ],
    'dim',
    rig,
  );
  r.dimension([-w / 2, y, -18], [w / 2, y, -18], `${w} cm`, [0, 0, -3], rig).notSide = true;
  r.line(
    [
      [-w / 2, y, 0],
      [-w / 2, y, -22],
    ],
    'dim',
    rig,
  );
  r.line(
    [
      [w / 2, y, 0],
      [w / 2, y, -22],
    ],
    'dim',
    rig,
  );
  const side = r.group(rig, {}, { visible: view === 'side' });
  const seatHeight = floorHeight(s, 'seatH');
  r.dimension(
    [left, 0, 5],
    [left, seatHeight, 5],
    `Seat ${seatHeight} cm`,
    [0, 0, -7],
    side,
  ).sideOnly = true;
  if (s.wheel) {
    const wheelHeight = floorHeight(s, 'wheelH');
    r.dimension(
      [left, 0, l + 18],
      [left, wheelHeight, l + 18],
      `Wheel ${wheelHeight} cm`,
      [0, 0, 8],
      side,
    ).sideOnly = true;
  }
  const baseAxis = 10 + rigLift(s);
  r.dimension(
    [w / 2 + 12, 0, l / 2],
    [w / 2 + 12, baseAxis, l / 2],
    `Base · axis ${baseAxis} cm`,
    [0, 0, 5],
    side,
  ).sideOnly = true;
  for (const label of r.labels.slice(first)) label.rigLabel = true;
  placeLabels(r.labels, first, e.rigPose);
}

export function drawDeskDimensions(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
): void {
  const enabled = s.deskEnabled !== false;
  const desk = r.group(
    parent,
    enabled ? { position: [s.deskX, 0, s.deskZ], rotation: [0, degToRad(s.deskAngle), 0] } : {},
  );
  if (!enabled) return;
  const first = r.labels.length;
  const y = PLAN_HEIGHT_CM;
  r.dimension(
    [e.deskRight + 8, y, e.deskBack],
    [e.deskRight + 8, y, e.deskFront],
    `${s.deskWidth} cm`,
    [3, 0, 0],
    desk,
  ).notSide = true;
  r.dimension(
    [e.deskLeft, y, e.deskFront + 12],
    [e.deskRight, y, e.deskFront + 12],
    `${s.deskDepth} cm`,
    [0, 0, 3],
    desk,
  ).notSide = true;
  r.label('DESK', s.deskDepth / 2 - 20, s.deskH + 8, s.deskWidth / 2 - 8, true);
  placeLabels(r.labels, first, e.deskPose);
}

/** Names the shifter and handbrake side, and a monitor shared with the cockpit. */
export function drawSetupLabels(r: RenderList, s: CockpitConfig, e: CockpitEvaluation): void {
  if (s.cockpitEnabled !== false && (s.shifter || s.handbrake)) {
    const p = transformPoint(
      { x: e.drivingMount.x, y: floorHeight(s, 'hotasH') + 30, z: e.drivingMount.z },
      e.rigPose,
    );
    const controls =
      s.shifter && s.handbrake ? 'SHIFTER + HANDBRAKE' : s.shifter ? 'SHIFTER' : 'HANDBRAKE';
    const side = s.drivingSide === 'left' ? 'LEFT' : 'RIGHT';
    const tag = r.label(`${controls} · DRIVER'S ${side}`, p.x, p.y, p.z, true);
    tag.topOnly = true;
    tag.offsetY = -32;
  }
  if (s.deskEnabled !== false && s.monitorEnabled !== false && s.monitorMode === 'cockpit')
    r.label(
      `${s.monitorInches}″ · SHARED MONITOR`,
      e.monitorPoint.x,
      s.monitorH + e.monitorH / 2 + 8,
      e.monitorPoint.z,
      true,
    );
}

/** Outlines the item being moved, just above its top, in the plan views. */
export function drawLayoutSelection(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  { view, layoutEditing, layoutTarget }: LayoutSelection,
): void {
  if (!layoutEditing || !isPlanView(view)) return;
  const item = e.desktopItems.find((i) => i.id === layoutTarget);
  const furniture = e.room.furniture.find((i) => 'furniture:' + i.id === layoutTarget);
  const feature = e.room.features.find((i) => 'feature:' + i.id === layoutTarget);
  const polygon: readonly PlanPoint[] = furniture
    ? furniture.polygon
    : feature
      ? 'leaf' in feature
        ? feature.leaf
        : [feature.a, feature.b]
      : item
        ? item.polygon
        : layoutTarget === 'desk'
          ? e.deskPolygon
          : e.rigPolygon;
  const y = furniture ? furniture.y1 + 1 : item ? s.deskH + item.height + 1 : 1.5;
  if (polygon.length)
    r.line(
      [...polygon, polygon[0]].map((p) => [p.x, y, p.z]),
      r.material({ kind: 'line', color: SELECTION_COLOR }),
      parent,
    );
  if (item && view === 'top')
    r.label(item.label.toUpperCase(), item.world.x, y + 4, item.world.z, true).offsetY = -24;
}
