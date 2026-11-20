// Draws the profiles, plates, feet, peripherals and connectors of a CAD cockpit design. Parts are
// in mm in cockpit coordinates; the scene works in cm. Parts at a tilt go into one group per tilt,
// turned about the cockpit origin as their frame is (src/cad/assembly.ts).
import { degToRad } from '../../shared/geometry.ts';
import type { PaletteMaterial, ParentRef, RenderList, Vec3 } from '../../scene/render-list.ts';
import {
  faceAxis,
  peripheralPointInFrame,
  type Axis,
  type BoxMm,
  type PeripheralPart,
  type ResolvedPart,
  type Vec3Mm,
} from '../cad/parts/assembly.ts';
import { connectorType, isPlateBolt, profileSystem } from '../cad/parts/catalog.ts';
import type { PlacedConnector } from '../cad/parts/connectors.ts';
import type { MeasureDrawing } from './measurement.ts';
import type { Handle } from '../cad/interaction/handles.ts';
import type { SnapGuide } from '../cad/interaction/snapping.ts';
import type { JointMarker } from '../cad/interaction/joint-markers.ts';
import { MM_PER_CM } from '../../shared/units.ts';
import type { DriverFigure } from '../cad/driver/driver.ts';

/** A cockpit design as the scene shows it: its resolved parts and the one selected. */
export interface CockpitDrawing {
  resolved: ReadonlyMap<string, ResolvedPart>;
  /** The connectors on its joints. */
  connectors?: readonly PlacedConnector[];
  selectedPartId: string | null;
  /** A part about to be added, drawn as a preview. */
  previewPartId?: string | null;
  /** The part whose face a click chooses, while a part is about to be added to it. */
  choosingFaceOf?: string | null;
  /** The handles of the selected part, to drag in the view. */
  handles?: readonly Handle[];
  /** The guide of what a dragged handle snapped to. */
  snapGuide?: SnapGuide | null;
  /** A part being placed, measured along the profile it hangs from. */
  placedPartId?: string | null;
  /** The markers of joints, over the view. */
  jointMarkers?: readonly JointMarker[];
  /** A measurement being taken in the view. */
  measure?: MeasureDrawing | null;
  /**
   * Whether the design is being fitted to the driver: peripherals are drawn and picked as parts.
   * Otherwise they are a grey reference that clicks go through.
   */
  fitting?: boolean;
  /** The driver seated in the design, drawn while fitting. */
  driver?: DriverFigure | null;
}

/** Grooves stop this much short of the profile length. */
const GROOVE_SHORTFALL_CM = 0.5;
/** A groove as drawn: a thin strip standing just proud of its face. */
const GROOVE_WIDTH_CM = 0.3;
const GROOVE_THICKNESS_CM = 0.09;
const GROOVE_PROUD_CM = 0.04;

/** A foot as drawn: a rubber pad on the floor and a threaded stem up to the profile. */
const FOOT_PAD_HEIGHT_MM = 15;
const FOOT_STEM_RADIUS_MM = 8;

const AXES: readonly Axis[] = ['x', 'y', 'z'];
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/** One group per tilt, turned about the cockpit origin, made the first time a tilt is drawn. */
function tiltFrames(r: RenderList, parent: ParentRef): (tiltDeg: number) => ParentRef {
  const tiltGroups = new Map<number, ParentRef>();
  return (tiltDeg) => {
    if (tiltDeg === 0) return parent;
    let group = tiltGroups.get(tiltDeg);
    if (group === undefined) {
      group = r.group(parent, { rotation: [-degToRad(tiltDeg), 0, 0] });
      tiltGroups.set(tiltDeg, group);
    }
    return group;
  };
}

export function drawCadProfiles(
  r: RenderList,
  parent: ParentRef,
  resolved: ReadonlyMap<string, ResolvedPart>,
  selectedId: string | null = null,
  previewId: string | null = null,
  { fitting = false }: { fitting?: boolean } = {},
): void {
  const frameOf = tiltFrames(r, parent);
  for (const resolvedPart of resolved.values()) {
    const { part, box, tiltDeg } = resolvedPart;
    if (part.kind === 'foot') drawFoot(r, frameOf(tiltDeg), box, part.id === selectedId);
    if (part.kind === 'peripheral') {
      // Out of Fit a peripheral is only a reference for the frame, never selected or previewed.
      const shown: PeripheralLook = !fitting
        ? 'reference'
        : part.id === previewId
          ? 'preview'
          : part.id === selectedId
            ? 'selected'
            : 'own';
      drawPeripheral(r, frameOf(tiltDeg), resolvedPart, shown);
    }
    if (part.kind !== 'profile' && part.kind !== 'plate') continue;
    const size = sizeOf(box);
    const material =
      part.id === previewId ? 'preview' : part.id === selectedId ? 'selected' : 'silver';
    const solid = r.box(...size, ...centerOf(box), material, frameOf(tiltDeg), true);
    if (part.kind === 'profile')
      drawGrooves(r, solid.id, size, part.axis, cm(profileSystem(part.systemId).series));
  }
}

/** How a peripheral is drawn: in its own materials, or all in one that marks its state. */
type PeripheralLook = 'own' | 'selected' | 'preview' | 'reference';

/** A box of a peripheral's drawing, in its own frame from its mounting origin, in mm. */
interface ShapeBox {
  min: Vec3Mm;
  max: Vec3Mm;
  material: PaletteMaterial;
}

/** A wheel rim, a ring across the peripheral's front, in its own frame. */
interface Rim {
  centerMm: Vec3Mm;
  radiusMm: number;
}

/** A seat as drawn: a cushion this share of its height, and a backrest this share of its depth. */
const SEAT_CUSHION_HEIGHT_SHARE = 0.25;
const SEAT_BACKREST_DEPTH_SHARE = 0.2;
/** A wheel base as drawn: a body behind the rim, this share of the envelope across and up. */
const WHEEL_BODY_WIDTH_SHARE = 0.5;
const WHEEL_BODY_HEIGHT_SHARE = 0.65;
const WHEEL_BODY_START_SHARE = 0.3;
const WHEEL_SHAFT_HALF_MM = 20;
const RIM_TUBE_MM = 15;
const RIM_SEGMENTS = 24;
/** Pedals as drawn: three pedals on a base plate. */
const PEDAL_BASE_MM = 20;
const PEDAL_WIDTH_MM = 60;
const PEDAL_DEPTH_SHARE = 0.1;
const PEDAL_COUNT = 3;

/**
 * A peripheral as a few simple shapes filling its envelope, so its kind and the way it faces
 * can be told apart: a seat's cushion and backrest, a wheel base with its rim towards the
 * driver, pedals on a base. Checks use the envelope itself, not these shapes.
 */
function drawPeripheral(
  r: RenderList,
  frame: ParentRef,
  resolved: ResolvedPart,
  look: PeripheralLook,
): void {
  if (resolved.part.kind !== 'peripheral') return;
  const { boxes, rim } = peripheralShapes(resolved.part);
  const materialOf = (own: PaletteMaterial): PaletteMaterial => (look === 'own' ? own : look);
  const inFrameCm = (localMm: Vec3Mm): Vec3 => {
    const point = peripheralPointInFrame(resolved, localMm);
    return [cm(point.x), cm(point.y), cm(point.z)];
  };
  for (const shape of boxes) {
    const a = inFrameCm(shape.min);
    const b = inFrameCm(shape.max);
    const size: Vec3 = [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])];
    const middle: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    r.box(...size, ...middle, materialOf(shape.material), frame);
  }
  if (!rim) return;
  const ring = Array.from({ length: RIM_SEGMENTS + 1 }, (_, index) => {
    const angle = (2 * Math.PI * index) / RIM_SEGMENTS;
    return inFrameCm({
      x: rim.centerMm.x + rim.radiusMm * Math.cos(angle),
      y: rim.centerMm.y + rim.radiusMm * Math.sin(angle),
      z: rim.centerMm.z,
    });
  });
  for (let index = 0; index < RIM_SEGMENTS; index++)
    r.tube(ring[index], ring[index + 1], cm(RIM_TUBE_MM), materialOf('rubber'), frame);
}

/** The shapes of a peripheral of each kind, made from its envelope. */
function peripheralShapes(part: PeripheralPart): { boxes: ShapeBox[]; rim: Rim | null } {
  const { widthMm, heightMm, depthMm } = part.envelope;
  const halfWidth = widthMm / 2;
  const back = -depthMm / 2;
  const front = depthMm / 2;
  const shape = (
    from: [number, number, number],
    to: [number, number, number],
    material: PaletteMaterial,
  ): ShapeBox => ({
    min: { x: from[0], y: from[1], z: from[2] },
    max: { x: to[0], y: to[1], z: to[2] },
    material,
  });
  switch (part.category) {
    case 'seat': {
      const cushionTop = heightMm * SEAT_CUSHION_HEIGHT_SHARE;
      const backrestFront = back + depthMm * SEAT_BACKREST_DEPTH_SHARE;
      return {
        boxes: [
          shape([-halfWidth, 0, back], [halfWidth, cushionTop, front], 'seat'),
          shape([-halfWidth, cushionTop, back], [halfWidth, heightMm, backrestFront], 'seat'),
        ],
        rim: null,
      };
    }
    case 'wheel-base': {
      const bodyHalfWidth = (widthMm * WHEEL_BODY_WIDTH_SHARE) / 2;
      const bodyBack = back + depthMm * WHEEL_BODY_START_SHARE;
      const rimZ = back + RIM_TUBE_MM;
      const axleY = heightMm / 2;
      const shaft = WHEEL_SHAFT_HALF_MM;
      return {
        boxes: [
          shape(
            [-bodyHalfWidth, 0, bodyBack],
            [bodyHalfWidth, heightMm * WHEEL_BODY_HEIGHT_SHARE, front],
            'dark',
          ),
          shape([-shaft, axleY - shaft, rimZ], [shaft, axleY + shaft, bodyBack], 'dark'),
        ],
        rim: {
          centerMm: { x: 0, y: axleY, z: rimZ },
          radiusMm: Math.min(widthMm, heightMm) / 2 - RIM_TUBE_MM,
        },
      };
    }
    case 'pedals': {
      const pedalHalfDepth = (depthMm * PEDAL_DEPTH_SHARE) / 2;
      const spacingMm = widthMm / PEDAL_COUNT;
      const pedals = Array.from({ length: PEDAL_COUNT }, (_, index) => {
        const centerX = (index - (PEDAL_COUNT - 1) / 2) * spacingMm;
        const half = Math.min(PEDAL_WIDTH_MM, spacingMm) / 2;
        return shape(
          [centerX - half, PEDAL_BASE_MM, -pedalHalfDepth],
          [centerX + half, heightMm, pedalHalfDepth],
          'silver',
        );
      });
      return {
        boxes: [shape([-halfWidth, 0, back], [halfWidth, PEDAL_BASE_MM, front], 'dark'), ...pedals],
        rim: null,
      };
    }
  }
}

const sizeOf = (box: BoxMm): Vec3 => [
  cm(box.max.x - box.min.x),
  cm(box.max.y - box.min.y),
  cm(box.max.z - box.min.z),
];
const centerOf = (box: BoxMm): Vec3 => [
  cm((box.min.x + box.max.x) / 2),
  cm((box.min.y + box.max.y) / 2),
  cm((box.min.z + box.max.z) / 2),
];

const cm = (mm: number) => mm / MM_PER_CM;

/**
 * Each corner bracket as an L of two plates: one against the side of the joined part, the other
 * on the face of the part it meets, both filling the connector's box from the joint's corner.
 * A plate bolt shows only its head, which fills its box on the plate.
 */
export function drawConnectors(
  r: RenderList,
  parent: ParentRef,
  connectors: readonly PlacedConnector[],
): void {
  const frameOf = tiltFrames(r, parent);
  for (const connector of connectors) {
    const { box } = connector;
    if (isPlateBolt(connector.typeId)) {
      r.box(...sizeOf(box), ...centerOf(box), 'dark', frameOf(connector.tiltDeg));
      continue;
    }
    const thicknessMm = connectorType(connector.typeId).thicknessMm;
    const againstPart = plateOf(
      box,
      faceAxis(connector.side),
      connector.side[0] === '+',
      thicknessMm,
    );
    const onFace = plateOf(
      box,
      faceAxis(connector.toFace),
      connector.toFace[0] === '+',
      thicknessMm,
    );
    for (const plate of [againstPart, onFace])
      r.box(
        cm(plate.max.x - plate.min.x),
        cm(plate.max.y - plate.min.y),
        cm(plate.max.z - plate.min.z),
        cm((plate.min.x + plate.max.x) / 2),
        cm((plate.min.y + plate.max.y) / 2),
        cm((plate.min.z + plate.max.z) / 2),
        'dark',
        frameOf(connector.tiltDeg),
      );
  }
}

/**
 * The slice of `box` `thicknessMm` thick along `axis`: at its low end if `fromLow`, else at its
 * high end.
 */
function plateOf(box: BoxMm, axis: Axis, fromLow: boolean, thicknessMm: number): BoxMm {
  const plate: BoxMm = { min: { ...box.min }, max: { ...box.max } };
  if (fromLow) plate.max[axis] = box.min[axis] + thicknessMm;
  else plate.min[axis] = box.max[axis] - thicknessMm;
  return plate;
}

function drawFoot(r: RenderList, frame: ParentRef, box: BoxMm, selected: boolean): void {
  const x = cm((box.min.x + box.max.x) / 2);
  const z = cm((box.min.z + box.max.z) / 2);
  const padTopMm = box.min.y + FOOT_PAD_HEIGHT_MM;
  r.box(
    cm(box.max.x - box.min.x),
    cm(FOOT_PAD_HEIGHT_MM),
    cm(box.max.z - box.min.z),
    x,
    cm(box.min.y + FOOT_PAD_HEIGHT_MM / 2),
    z,
    selected ? 'selected' : 'rubber',
    frame,
  );
  r.cylinder(
    cm(FOOT_STEM_RADIUS_MM),
    cm(box.max.y - padTopMm),
    x,
    cm((padTopMm + box.max.y) / 2),
    z,
    selected ? 'selected' : 'silver',
    frame,
  );
}

/**
 * One groove per slot on each long face of a bar of `size`, centered on the bar. The slots of
 * a series sit one series module apart, so a face as wide as two modules has two.
 */
function drawGrooves(
  r: RenderList,
  bar: ParentRef,
  size: Vec3,
  lengthAxis: Axis,
  moduleCm: number,
): void {
  const along = AXIS_INDEX[lengthAxis];
  for (const normalAxis of AXES) {
    if (normalAxis === lengthAxis) continue;
    const normal = AXIS_INDEX[normalAxis];
    const across = 3 - along - normal;
    const faceWidth = size[across];
    const slots = Math.max(1, Math.round(faceWidth / moduleCm));
    for (const side of [-1, 1]) {
      for (let slot = 0; slot < slots; slot++) {
        const grooveSize: Vec3 = [0, 0, 0];
        grooveSize[along] = size[along] - GROOVE_SHORTFALL_CM;
        grooveSize[normal] = GROOVE_THICKNESS_CM;
        grooveSize[across] = GROOVE_WIDTH_CM;
        const position: Vec3 = [0, 0, 0];
        position[normal] = side * (size[normal] / 2 + GROOVE_PROUD_CM);
        position[across] = (slot + 0.5) * (faceWidth / slots) - faceWidth / 2;
        r.box(...grooveSize, ...position, 'groove', bar);
      }
    }
  }
}
