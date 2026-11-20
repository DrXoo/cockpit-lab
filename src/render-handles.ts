// Draws the stems of the handles of the selected part: a thin bar from the end a handle changes
// out to the handle itself, which the scene shows on top of the view. A move handle sits on its
// part, with no stem; a travel handle sits on a dashed line from one end of its travel to the
// other, with a mark across it at the center, both drawn over the parts, which a seat's travel
// lies inside. Draws the dashed guide of what a dragged handle snapped to. Positions are in mm in cockpit coordinates; the scene works in cm.
import type { Handle, TravelHandle } from './cad/handles.ts';
import type { SnapGuide } from './cad/snapping.ts';
import type { Vec3Mm } from './cad/assembly.ts';
import type { ParentRef, RenderList } from './scene/render-list.ts';
import { MM_PER_CM } from './shared/units.ts';

/** How far a handle stands off the end it changes, so it never hides behind the part. */
const HANDLE_STANDOFF_MM = 40;
const STEM_THICKNESS_CM = 0.3;
/** How far the mark at the center of a travel reaches either side of its line. */
const TRAVEL_MARK_HALF_MM = 15;

/** Where the ball of a handle is: off the end it changes, or at the center of a moved part. */
export function handleBallMm({ kind, pointMm, outwardMm }: Handle): Vec3Mm {
  if (kind === 'move' || kind === 'travel') return { ...pointMm };
  return {
    x: pointMm.x + outwardMm.x * HANDLE_STANDOFF_MM,
    y: pointMm.y + outwardMm.y * HANDLE_STANDOFF_MM,
    z: pointMm.z + outwardMm.z * HANDLE_STANDOFF_MM,
  };
}

export function drawHandleStems(
  r: RenderList,
  parent: ParentRef,
  handles: readonly Handle[],
): void {
  for (const handle of handles) {
    if (handle.kind === 'move') continue;
    if (handle.kind === 'travel') {
      drawTravel(r, parent, handle);
      continue;
    }
    drawBar(r, parent, handle.pointMm, handleBallMm(handle));
  }
}

/** A thin bar from one point to another, along an axis of the scene. */
function drawBar(r: RenderList, parent: ParentRef, from: Vec3Mm, to: Vec3Mm) {
  const size = (['x', 'y', 'z'] as const).map((axis) =>
    Math.max(Math.abs(to[axis] - from[axis]) / MM_PER_CM, STEM_THICKNESS_CM),
  );
  r.box(
    size[0],
    size[1],
    size[2],
    (from.x + to.x) / 2 / MM_PER_CM,
    (from.y + to.y) / 2 / MM_PER_CM,
    (from.z + to.z) / 2 / MM_PER_CM,
    'hover',
    parent,
  );
}

/**
 * The line a travel handle slides on, end to end, and the mark across it at its center, upright
 * unless the travel runs up, then across.
 */
function drawTravel(r: RenderList, parent: ParentRef, handle: TravelHandle) {
  const { centerMm, fromMm, toMm } = handle.travel;
  const material = r.material(GUIDE);
  r.line([cm(fromMm), cm(toMm)], material, parent);
  const markAxis = handle.axis === 'y' ? 'x' : 'y';
  const markEnd = (sign: 1 | -1) => {
    const end = { ...centerMm };
    end[markAxis] += sign * TRAVEL_MARK_HALF_MM;
    return cm(end);
  };
  r.line([markEnd(-1), markEnd(1)], material, parent);
}

/** A guide dashed in the accent of the handles, drawn over the parts: a snap's or a travel's. */
const GUIDE = {
  kind: 'dashed',
  color: 0x2f7fd0,
  dashSize: 1.5,
  gapSize: 1,
  onTop: true,
} as const;

export function drawSnapGuide(r: RenderList, parent: ParentRef, guide: SnapGuide): void {
  r.line([cm(guide.fromMm), cm(guide.toMm)], r.material(GUIDE), parent);
}

const cm = ({ x, y, z }: Vec3Mm): [number, number, number] => [
  x / MM_PER_CM,
  y / MM_PER_CM,
  z / MM_PER_CM,
];
