// Camera framing: what each view looks at and how much of the plan it shows.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad, transformPoint, type PlanPoint, type Point3 } from './geometry.ts';
import { rigLift } from './rig.ts';

export type SceneView = 'iso' | 'top' | 'desk' | 'side';

/** Plan extent of everything drawn, in world cm. */
export interface SceneBounds {
  left: number;
  right: number;
  back: number;
  front: number;
}

/** What the camera frames once the scene has been built. */
export interface Framing {
  state: CockpitConfig;
  evaluation: CockpitEvaluation;
  bounds: SceneBounds;
}

export interface CameraPose {
  position: Point3;
  target: Point3;
  up: Point3;
  /** Only the 3D view orbits; the plan views pan with the left button. */
  rotate: boolean;
  /** Allowed polar angle range, in radians. */
  polar: [min: number, max: number];
}

/** Sizes used before the first update, or when a measure is zero. */
const FALLBACK_CM = {
  spanX: 260,
  spanZ: 280,
  deskDepth: 80,
  deskWidth: 140,
  length: 145,
  spaceW: 180,
  spaceD: 165,
};
/** Distance from the target to the camera; far enough for an orthographic camera. */
const CAMERA_DISTANCE_CM = 650;
/** Height of the point the side view looks at. */
const SIDE_TARGET_HEIGHT_CM = 62;
/** Height of the point the 3D view looks at. */
const ISO_TARGET_HEIGHT_CM = 37;
/** Offsets of the 3D camera from its target. */
const ISO_OFFSET_CM = { x: -320, y: 245, z: 320 };
/** Keeps the 3D camera above the floor. */
const ISO_POLAR_RAD: [number, number] = [0.05, Math.PI / 2 - 0.02];
const PLAN_POLAR_RAD: [number, number] = [0, Math.PI];

export function sceneBounds(s: CockpitConfig, e: CockpitEvaluation): SceneBounds {
  const roomPoints: PlanPoint[] =
    s.roomEnabled !== false
      ? [
          ...e.room.furniture.flatMap((item) => [...item.polygon, ...(item.reserve || [])]),
          ...e.room.features.flatMap((item) => ('arc' in item ? item.arc : [item.a, item.b])),
          { x: e.roomBounds.left, z: e.roomBounds.back },
          { x: e.roomBounds.right, z: e.roomBounds.front },
        ]
      : [];
  return {
    left: Math.min(e.allLeft, ...roomPoints.map((p) => p.x)),
    right: Math.max(e.allRight, ...roomPoints.map((p) => p.x)),
    back: Math.min(e.allBack, ...roomPoints.map((p) => p.z)),
    front: Math.max(e.allFront, ...roomPoints.map((p) => p.z)),
  };
}

/** Height of the orthographic frustum, in cm, for a viewport of the given aspect ratio. */
export function viewHeight(view: SceneView, aspect: number, framing: Framing | null): number {
  const s = framing?.state;
  const e = framing?.evaluation;
  const spanX = framing ? framing.bounds.right - framing.bounds.left : FALLBACK_CM.spanX;
  const spanZ = framing ? framing.bounds.front - framing.bounds.back : FALLBACK_CM.spanZ;
  if (view === 'desk')
    return Math.max(
      (s?.deskDepth || FALLBACK_CM.deskDepth) + 30,
      ((s?.deskWidth || FALLBACK_CM.deskWidth) + 40) / aspect,
    );
  if (view === 'top') return Math.max(spanZ + 60, (spanX + 60) / aspect);
  if (view === 'side')
    return Math.max(205 + 2 * rigLift(s ?? {}), ((s?.length || FALLBACK_CM.length) + 50) / aspect);
  // The diagonal projection must also fit the width of a portrait screen.
  return Math.max(
    245,
    (e?.spaceW || FALLBACK_CM.spaceW) / aspect + 55,
    (e?.spaceD || FALLBACK_CM.spaceD) * 0.72 + 100,
    ((spanX + spanZ) * 0.78) / aspect,
    s?.roomEnabled !== false ? (spanX + spanZ) * 0.62 : 0,
  );
}

function viewCenter(view: SceneView, { state: s, evaluation: e, bounds }: Framing) {
  if (view === 'top' || view === 'iso')
    return { x: (bounds.left + bounds.right) / 2, z: (bounds.back + bounds.front) / 2 };
  if (view === 'desk') return { x: s.deskX, z: s.deskZ };
  const p = transformPoint({ x: 0, z: s.length / 2 }, e.rigPose);
  return { x: p.x, z: p.z };
}

export function cameraPose(view: SceneView, framing: Framing): CameraPose {
  const s = framing.state;
  const center = viewCenter(view, framing);
  if (view === 'desk') {
    const angle = degToRad(s.deskAngle);
    return {
      target: { x: center.x, y: s.deskH, z: center.z },
      position: { x: center.x, y: CAMERA_DISTANCE_CM, z: center.z + 0.001 },
      up: { x: Math.cos(angle), y: 0, z: -Math.sin(angle) },
      rotate: false,
      polar: PLAN_POLAR_RAD,
    };
  }
  if (view === 'top')
    return {
      target: { x: center.x, y: 0, z: center.z },
      position: { x: center.x, y: CAMERA_DISTANCE_CM, z: center.z + 0.01 },
      up: { x: 0, y: 0, z: -1 },
      rotate: false,
      polar: PLAN_POLAR_RAD,
    };
  if (view === 'side') {
    const angle = degToRad(s.cockpitAngle);
    return {
      target: { x: center.x, y: SIDE_TARGET_HEIGHT_CM, z: center.z },
      position: {
        x: center.x - CAMERA_DISTANCE_CM * Math.cos(angle),
        y: SIDE_TARGET_HEIGHT_CM,
        z: center.z + CAMERA_DISTANCE_CM * Math.sin(angle),
      },
      up: { x: 0, y: 1, z: 0 },
      rotate: false,
      polar: PLAN_POLAR_RAD,
    };
  }
  return {
    target: { x: center.x, y: ISO_TARGET_HEIGHT_CM, z: center.z },
    position: {
      x: center.x + ISO_OFFSET_CM.x,
      y: ISO_OFFSET_CM.y,
      z: center.z + ISO_OFFSET_CM.z,
    },
    up: { x: 0, y: 1, z: 0 },
    rotate: true,
    polar: ISO_POLAR_RAD,
  };
}
