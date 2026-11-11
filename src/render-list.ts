// The vocabulary of the render model: what the scene draws, as plain data in drawing order.
// The Three.js adapter turns each primitive into an object. Drawing order matters because
// Three.js breaks ties between overlapping transparent objects by creation order.
import type { PlanPoint, Point3 } from './geometry.ts';
import type { SceneView } from './scene-camera.ts';

export type Vec3 = [x: number, y: number, z: number];
export type Color = string | number;

/** Materials shared by every drawing, defined once by the adapter. */
export type PaletteMaterial =
  | 'silver'
  | 'dark'
  | 'seat'
  | 'fabric'
  | 'orange'
  | 'rubber'
  | 'groove'
  | 'wood'
  | 'desk'
  | 'blue'
  | 'dim'
  | 'arm'
  | 'screen';

export type MaterialSpec =
  /** Unlit and visible from both sides, for walls, floors and plan zones. */
  | { kind: 'flat'; color: Color; opacity: number }
  /** Lit, for furniture and desktop objects. */
  | { kind: 'matte'; color: Color; roughness: number }
  /** Outlines; transparent when an opacity is given. */
  | { kind: 'line'; color: Color; opacity?: number }
  /** Dashed outlines in their own colour; `dashed` lines use the measurement style. */
  | { kind: 'dashed'; color: Color; dashSize: number; gapSize: number };

/** A palette material, or the id returned by `material()`. */
export type MaterialRef = PaletteMaterial | number;
/** A group, or a box that other drawings attach to. */
export type ParentRef = number;

/** The group the whole list is drawn into. */
export const ROOT: ParentRef = 0;

interface Placed {
  parent: ParentRef;
  position: Vec3;
  /** Euler angles in radians, applied in X, Y, Z order. */
  rotation: Vec3;
}

export interface MaterialPrimitive {
  kind: 'material';
  id: number;
  spec: MaterialSpec;
}
export interface GroupPrimitive extends Placed {
  kind: 'group';
  id: ParentRef;
  visible: boolean;
  /** Dimension groups are shown and hidden without rebuilding the scene. */
  role?: 'dimensions';
}
export interface BoxPrimitive extends Placed {
  kind: 'box';
  id: ParentRef;
  size: Vec3;
  scale: Vec3;
  material: MaterialRef;
  /** Outlines the box edges, as on aluminium profiles. */
  edges: boolean;
}
export interface CylinderPrimitive extends Placed {
  kind: 'cylinder';
  radius: number;
  length: number;
  segments: number;
  material: MaterialRef;
}
export interface SpherePrimitive extends Placed {
  kind: 'sphere';
  radius: number;
  scale: Vec3;
  material: MaterialRef;
}
/** A cylinder between two points. */
export interface TubePrimitive {
  kind: 'tube';
  parent: ParentRef;
  from: Vec3;
  to: Vec3;
  radius: number;
  material: MaterialRef;
}
export interface TorusPrimitive extends Placed {
  kind: 'torus';
  radius: number;
  tube: number;
  radialSegments: number;
  tubularSegments: number;
  material: MaterialRef;
}
export interface LinePrimitive {
  kind: 'line';
  parent: ParentRef;
  points: Vec3[];
  /** `dashed` uses the dashed measurement style. */
  material: MaterialRef | 'dashed';
}
/** A filled plan outline, drawn just above the floor. */
export interface FillPrimitive {
  kind: 'fill';
  parent: ParentRef;
  outline: PlanPoint[];
  height: number;
  material: MaterialRef;
}
/** A horizontal rectangle that receives shadows. */
export interface PlanePrimitive extends Placed {
  kind: 'plane';
  width: number;
  depth: number;
  material: MaterialRef;
}

export type Primitive =
  | MaterialPrimitive
  | GroupPrimitive
  | BoxPrimitive
  | CylinderPrimitive
  | SpherePrimitive
  | TubePrimitive
  | TorusPrimitive
  | LinePrimitive
  | FillPrimitive
  | PlanePrimitive;

/** A text overlay at a world position, and the views it belongs to. */
export interface SceneLabel {
  text: string;
  position: Point3;
  /** Names an object rather than a measurement. */
  object: boolean;
  /** Extra CSS class. */
  className?: string;
  topOnly?: boolean;
  sideOnly?: boolean;
  notSide?: boolean;
  /** Belongs to the rig, so the desk view hides it. */
  rigLabel?: boolean;
  /** Marks a draggable monitor arm joint. */
  armHandle?: boolean;
  /** Vertical screen offset, in px. */
  offsetY?: number;
}

/** Whether a label belongs in a view. Labels outside the viewport are hidden separately. */
export function labelShownIn(label: SceneLabel, view: SceneView): boolean {
  return !(
    (view === 'side' && (label.object || label.notSide)) ||
    (view === 'desk' && label.rigLabel) ||
    (label.topOnly && view !== 'top') ||
    (label.sideOnly && view !== 'side') ||
    (label.armHandle && view !== 'top' && view !== 'desk')
  );
}

const ORIGIN: Vec3 = [0, 0, 0];
const UNIT_SCALE: Vec3 = [1, 1, 1];
/** Half length of the ticks at the ends of a dimension line. */
const TICK_HALF_LENGTH_CM = 2.2;
const TICK_HALF_HEIGHT_CM = 0.1;

export function createRenderList() {
  const primitives: Primitive[] = [];
  const labels: SceneLabel[] = [];
  let lastId = ROOT;

  const add = <P extends Primitive>(primitive: P): P => {
    primitives.push(primitive);
    return primitive;
  };

  function material(spec: MaterialSpec): number {
    const id = ++lastId;
    add({ kind: 'material', id, spec });
    return id;
  }

  function group(
    parent: ParentRef,
    { position = ORIGIN, rotation = ORIGIN }: { position?: Vec3; rotation?: Vec3 } = {},
    options: Pick<GroupPrimitive, 'role'> & { visible?: boolean } = {},
  ): ParentRef {
    const id = ++lastId;
    add({
      kind: 'group',
      id,
      parent,
      position: [...position],
      rotation: [...rotation],
      visible: options.visible ?? true,
      ...(options.role ? { role: options.role } : {}),
    });
    return id;
  }

  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: MaterialRef,
    parent: ParentRef,
    edges = false,
  ) =>
    add<BoxPrimitive>({
      kind: 'box',
      id: ++lastId,
      parent,
      size: [w, h, d],
      position: [x, y, z],
      rotation: [...ORIGIN],
      scale: [...UNIT_SCALE],
      material: mat,
      edges,
    });

  const cylinder = (
    radius: number,
    length: number,
    x: number,
    y: number,
    z: number,
    mat: MaterialRef,
    parent: ParentRef,
    segments = 16,
  ) =>
    add<CylinderPrimitive>({
      kind: 'cylinder',
      parent,
      radius,
      length,
      segments,
      position: [x, y, z],
      rotation: [...ORIGIN],
      material: mat,
    });

  const sphere = (
    radius: number,
    x: number,
    y: number,
    z: number,
    mat: MaterialRef,
    parent: ParentRef,
  ) =>
    add<SpherePrimitive>({
      kind: 'sphere',
      parent,
      radius,
      position: [x, y, z],
      rotation: [...ORIGIN],
      scale: [...UNIT_SCALE],
      material: mat,
    });

  const tube = (from: Vec3, to: Vec3, radius: number, mat: MaterialRef, parent: ParentRef) =>
    add<TubePrimitive>({ kind: 'tube', parent, from, to, radius, material: mat });

  const torus = (
    radius: number,
    tubeRadius: number,
    position: Vec3,
    mat: MaterialRef,
    parent: ParentRef,
    { radialSegments, tubularSegments }: { radialSegments: number; tubularSegments: number },
  ) =>
    add<TorusPrimitive>({
      kind: 'torus',
      parent,
      radius,
      tube: tubeRadius,
      radialSegments,
      tubularSegments,
      position,
      rotation: [...ORIGIN],
      material: mat,
    });

  const line = (points: Vec3[], mat: MaterialRef | 'dashed', parent: ParentRef) =>
    add<LinePrimitive>({ kind: 'line', parent, points, material: mat });

  /** Fills a plan outline with a flat colour, creating its material first. */
  function fill(
    outline: PlanPoint[],
    color: Color,
    opacity: number,
    height: number,
    parent: ParentRef,
  ) {
    const mat = material({ kind: 'flat', color, opacity });
    return add<FillPrimitive>({ kind: 'fill', parent, outline, height, material: mat });
  }

  const plane = (
    width: number,
    depth: number,
    position: Vec3,
    mat: MaterialRef,
    parent: ParentRef,
  ) =>
    add<PlanePrimitive>({
      kind: 'plane',
      parent,
      width,
      depth,
      position,
      rotation: [-Math.PI / 2, 0, 0],
      material: mat,
    });

  function label(text: string, x: number, y: number, z: number, object = false): SceneLabel {
    const item: SceneLabel = { text, position: { x, y, z }, object };
    labels.push(item);
    return item;
  }

  /** A measurement line with a tick at each end and its value at the middle. */
  function dimension(a: Vec3, b: Vec3, text: string, offset: Vec3, parent: ParentRef): SceneLabel {
    line([a, b], 'dim', parent);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const alongX = Math.abs(dx / length) > 0.5;
    const tick: Vec3 = alongX ? [0, 0, TICK_HALF_LENGTH_CM] : [TICK_HALF_LENGTH_CM, 0, 0];
    for (const p of [a, b])
      line(
        [
          [p[0] - tick[0], p[1] - TICK_HALF_HEIGHT_CM, p[2] - tick[2]],
          [p[0] + tick[0], p[1] + TICK_HALF_HEIGHT_CM, p[2] + tick[2]],
        ],
        'dim',
        parent,
      );
    return label(
      text,
      (a[0] + b[0]) / 2 + offset[0],
      (a[1] + b[1]) / 2 + offset[1],
      (a[2] + b[2]) / 2 + offset[2],
    );
  }

  return {
    primitives,
    labels,
    material,
    group,
    box,
    cylinder,
    sphere,
    tube,
    torus,
    line,
    fill,
    plane,
    label,
    dimension,
  };
}

export type RenderList = ReturnType<typeof createRenderList>;
