// Marks what is under the pointer in the cockpit editor: the part, wrapped in a see-through box
// just larger than it, or the face of it a click would choose, as a thin slab standing off it.
// Parts are in mm in cockpit coordinates; the scene works in cm.
import { faceAxis, type BoxMm, type Face, type ResolvedPart } from '../cad/parts/assembly.ts';
import { degToRad } from '../../shared/geometry.ts';
import type { ParentRef, RenderList, Vec3 } from '../../scene/render-list.ts';
import { MM_PER_CM } from '../../shared/units.ts';

/** How far the box around a hovered part stands off it on every side. */
const PART_MARGIN_MM = 2;
/** The slab on a hovered face: the gap that keeps it off the face, and its thickness. */
const FACE_GAP_MM = 0.5;
const FACE_SLAB_MM = 1;

export function drawHover(
  r: RenderList,
  parent: ParentRef,
  resolved: ResolvedPart,
  face: Face | null,
): void {
  const frame =
    resolved.tiltDeg === 0
      ? parent
      : r.group(parent, { rotation: [-degToRad(resolved.tiltDeg), 0, 0] });
  const box = face === null ? grown(resolved.box, PART_MARGIN_MM) : slabOn(resolved.box, face);
  r.box(...sizeOf(box), ...centerOf(box), 'hover', frame);
}

function grown(box: BoxMm, marginMm: number): BoxMm {
  return {
    min: { x: box.min.x - marginMm, y: box.min.y - marginMm, z: box.min.z - marginMm },
    max: { x: box.max.x + marginMm, y: box.max.y + marginMm, z: box.max.z + marginMm },
  };
}

function slabOn(box: BoxMm, face: Face): BoxMm {
  const axis = faceAxis(face);
  const slab: BoxMm = { min: { ...box.min }, max: { ...box.max } };
  if (face[0] === '+') {
    slab.min[axis] = box.max[axis] + FACE_GAP_MM;
    slab.max[axis] = slab.min[axis] + FACE_SLAB_MM;
  } else {
    slab.max[axis] = box.min[axis] - FACE_GAP_MM;
    slab.min[axis] = slab.max[axis] - FACE_SLAB_MM;
  }
  return slab;
}

const cm = (mm: number) => mm / MM_PER_CM;
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
