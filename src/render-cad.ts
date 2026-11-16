// Draws the profiles and feet of a CAD cockpit design. Parts are in mm in cockpit coordinates;
// the scene works in cm. Parts at a tilt go into one group per tilt, turned about the cockpit
// origin as their frame is (src/cad/assembly.ts).
import { degToRad } from './geometry.ts';
import type { ParentRef, RenderList, Vec3 } from './render-list.ts';
import type { Axis, BoxMm, ResolvedPart } from './cad/assembly.ts';
import { profileSystem } from './cad/catalog.ts';
import { MM_PER_CM } from './units.ts';

/** A cockpit design as the scene shows it: its resolved parts and the one selected. */
export interface CockpitDrawing {
  resolved: ReadonlyMap<string, ResolvedPart>;
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

export function drawCadProfiles(
  r: RenderList,
  parent: ParentRef,
  resolved: ReadonlyMap<string, ResolvedPart>,
  selectedId: string | null = null,
  previewId: string | null = null,
): void {
  const tiltGroups = new Map<number, ParentRef>();
  const frameOf = (tiltDeg: number): ParentRef => {
    if (tiltDeg === 0) return parent;
    let group = tiltGroups.get(tiltDeg);
    if (group === undefined) {
      group = r.group(parent, { rotation: [-degToRad(tiltDeg), 0, 0] });
      tiltGroups.set(tiltDeg, group);
    }
    return group;
  };
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
