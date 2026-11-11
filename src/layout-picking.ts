// What the pointer grabs in the plan views, and where the dragged item goes.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { clamp, inversePoint, round, type PlanPoint } from './geometry.ts';

/** An item being dragged: where the pointer started and where the item was. */
export interface LayoutGrab {
  /** `cockpit`, `desk`, a desktop item id, `furniture:<id>` or `feature:<id>`. */
  target: string;
  start: PlanPoint;
  x: number;
  z: number;
  /** Desktop items move in desk coordinates, everything else in world coordinates. */
  desktop: boolean;
}

export interface PickOptions {
  /** The current selection, preferred where items overlap. */
  layoutTarget: string;
  /** Room editing picks furniture and openings, then the desk and the cockpit. */
  roomEditing: boolean;
}

/** Desktop objects can be grabbed this far outside their outline. */
const DESKTOP_GRAB_MARGIN_CM = 1;
/** Openings are grabbed within this distance of their wall segment. */
const OPENING_GRAB_DISTANCE_CM = 8;
/** Door leaves are grabbed within this distance. */
const DOOR_LEAF_GRAB_DISTANCE_CM = 6;

const selectedFirst = (selected: string) => (a: string, b: string) =>
  a === selected ? -1 : b === selected ? 1 : 0;

function distanceToSegment(p: PlanPoint, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

/**
 * The item under the pointer. `floor` is the pointer on the floor plane and `top` on the
 * desk top plane, both in world coordinates.
 */
export function pickLayoutItem(
  floor: PlanPoint,
  top: PlanPoint,
  s: CockpitConfig,
  e: CockpitEvaluation,
  options: PickOptions,
): LayoutGrab | null {
  return (
    (options.roomEditing ? pickRoomItem(floor, e, options.layoutTarget) : null) ??
    pickSetupItem(floor, top, s, e, options)
  );
}

function pickRoomItem(floor: PlanPoint, e: CockpitEvaluation, selected: string): LayoutGrab | null {
  const preferSelected = selectedFirst(selected);
  const furniture = e.room.furniture.map((item) => ({ id: 'furniture:' + item.id, item }));
  const features = e.room.features.map((item) => ({ id: 'feature:' + item.id, item }));
  const candidates = [
    ...furniture.map((c) => ({ ...c, furniture: c.item, feature: null })),
    ...features.map((c) => ({ ...c, furniture: null, feature: c.item })),
  ].sort((a, b) => preferSelected(a.id, b.id));
  for (const candidate of candidates) {
    const { furniture: piece, feature } = candidate;
    let center: PlanPoint | null = null;
    if (piece) {
      const local = inversePoint(floor, { x: piece.x, z: piece.z, angle: piece.angle });
      if (Math.abs(local.x) <= piece.width / 2 && Math.abs(local.z) <= piece.depth / 2)
        center = piece;
    } else if (feature) {
      const onWall = distanceToSegment(floor, feature.a, feature.b) < OPENING_GRAB_DISTANCE_CM;
      const onLeaf =
        feature.type === 'door' &&
        distanceToSegment(floor, feature.hingePoint, feature.tip) < DOOR_LEAF_GRAB_DISTANCE_CM;
      if (onWall || onLeaf) center = feature.center;
    }
    if (center)
      return {
        target: candidate.id,
        start: { x: floor.x, z: floor.z },
        x: center.x,
        z: center.z,
        desktop: false,
      };
  }
  return null;
}

/** Desktop objects first, tallest first, then the desk and the cockpit. */
function pickSetupItem(
  floor: PlanPoint,
  top: PlanPoint,
  s: CockpitConfig,
  e: CockpitEvaluation,
  { layoutTarget, roomEditing }: PickOptions,
): LayoutGrab | null {
  const deskLocal = inversePoint(top, e.deskPose);
  const preferSelected = selectedFirst(layoutTarget);
  const desktop = roomEditing ? [] : e.desktopItems;
  const byHeight = [...desktop]
    .sort((a, b) => b.height - a.height || preferSelected(a.id, b.id))
    .map((item) => item.id);
  const order: string[] = [
    ...new Set([
      ...byHeight,
      ...(layoutTarget === 'cockpit' ? ['cockpit'] : []),
      'desk',
      'cockpit',
    ]),
  ];
  for (const id of order) {
    if (
      (id === 'desk' && s.deskEnabled === false) ||
      (id === 'cockpit' && s.cockpitEnabled === false) ||
      (id === 'arm' && s.monitorEnabled === false)
    )
      continue;
    const item = desktop.find((i) => i.id === id);
    if (item) {
      const local = inversePoint(deskLocal, item.local);
      if (
        Math.abs(local.x) <= item.sizeX / 2 + DESKTOP_GRAB_MARGIN_CM &&
        Math.abs(local.z) <= item.sizeZ / 2 + DESKTOP_GRAB_MARGIN_CM
      )
        return {
          target: id,
          start: { x: deskLocal.x, z: deskLocal.z },
          x: item.local.x,
          z: item.local.z,
          desktop: true,
        };
    } else if (id === 'desk') {
      const local = inversePoint(floor, e.deskPose);
      if (Math.abs(local.x) <= e.deskBounds.halfX && Math.abs(local.z) <= e.deskBounds.halfZ)
        return {
          target: id,
          start: { x: floor.x, z: floor.z },
          x: s.deskX,
          z: s.deskZ,
          desktop: false,
        };
    } else if (id === 'cockpit') {
      const local = inversePoint(floor, e.rigPose);
      if (
        local.x >= e.rigLeft &&
        local.x <= e.rigRight &&
        local.z >= e.lowerZ &&
        local.z <= e.upperZ
      )
        return {
          target: id,
          start: { x: floor.x, z: floor.z },
          x: s.cockpitX,
          z: s.cockpitZ,
          desktop: false,
        };
    }
  }
  return null;
}

/** Where the grabbed item goes when the pointer reaches `point`, in the grab's frame. */
export function draggedPosition(grab: LayoutGrab, point: PlanPoint): { x: number; z: number } {
  return {
    x: round(grab.x + point.x - grab.start.x),
    z: round(grab.z + point.z - grab.start.z),
  };
}
