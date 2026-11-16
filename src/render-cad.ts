// Draws the profiles, feet and connectors of a CAD cockpit design. Parts are in mm in cockpit coordinates;
// the scene works in cm. Parts at a tilt go into one group per tilt, turned about the cockpit
// origin as their frame is (src/cad/assembly.ts).
import { degToRad } from './geometry.ts';
import type { ParentRef, RenderList, Vec3 } from './render-list.ts';
import { faceAxis, type Axis, type BoxMm, type ResolvedPart } from './cad/assembly.ts';
import { connectorType, profileSystem } from './cad/catalog.ts';
import type { PlacedConnector } from './cad/connectors.ts';
import { MM_PER_CM } from './units.ts';

/** A cockpit design as the scene shows it: its resolved parts and the one selected. */
export interface CockpitDrawing {
  resolved: ReadonlyMap<string, ResolvedPart>;
  /** The connectors on its joints. */
  connectors?: readonly PlacedConnector[];
  selectedPartId: string | null;
  /** A part about to be added, drawn as a preview. */
  previewPartId?: string | null;
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
): void {
  const frameOf = tiltFrames(r, parent);
  for (const { part, box, tiltDeg } of resolved.values()) {
    if (part.kind === 'foot') drawFoot(r, frameOf(tiltDeg), box, part.id === selectedId);
    if (part.kind !== 'profile') continue;
    const size: Vec3 = [
      cm(box.max.x - box.min.x),
      cm(box.max.y - box.min.y),
      cm(box.max.z - box.min.z),
    ];
    const bar = r.box(
      ...size,
      cm((box.min.x + box.max.x) / 2),
      cm((box.min.y + box.max.y) / 2),
      cm((box.min.z + box.max.z) / 2),
      part.id === previewId ? 'preview' : part.id === selectedId ? 'selected' : 'silver',
      frameOf(tiltDeg),
      true,
    );
    drawGrooves(r, bar.id, size, part.axis, cm(profileSystem(part.systemId).series));
  }
}

const cm = (mm: number) => mm / MM_PER_CM;

/**
 * Each connector as an L of two plates: one against the side of the joined part, the other on
 * the face of the part it meets, both filling the connector's box from the joint's corner.
 */
export function drawConnectors(
  r: RenderList,
  parent: ParentRef,
  connectors: readonly PlacedConnector[],
): void {
  const frameOf = tiltFrames(r, parent);
  for (const connector of connectors) {
    const { box } = connector;
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
