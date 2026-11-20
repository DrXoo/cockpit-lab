// Measurements and labels drawn over the setup, and the outline of the selected item.
// Labels are positioned in world coordinates, whatever group their lines belong to.
import type { RoomConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad, transformPoint, type Placement, type PlanPoint } from './shared/geometry.ts';
import type { ParentRef, RenderList, SceneLabel } from './scene/render-list.ts';
import type { SceneView } from './scene/camera.ts';

export interface LayoutSelection {
  view: SceneView;
  layoutEditing: boolean;
  /** `desk`, a desktop item id, `furniture:<id>` or `feature:<id>`. */
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

export function drawDeskDimensions(
  r: RenderList,
  parent: ParentRef,
  s: RoomConfig,
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
  );
  r.dimension(
    [e.deskLeft, y, e.deskFront + 12],
    [e.deskRight, y, e.deskFront + 12],
    `${s.deskDepth} cm`,
    [0, 0, 3],
    desk,
  );
  r.label('DESK', s.deskDepth / 2 - 20, s.deskH + 8, s.deskWidth / 2 - 8, true);
  placeLabels(r.labels, first, e.deskPose);
}

/** Outlines the item being moved, just above its top, in the plan views. */
export function drawLayoutSelection(
  r: RenderList,
  parent: ParentRef,
  s: RoomConfig,
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
          : [];
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
