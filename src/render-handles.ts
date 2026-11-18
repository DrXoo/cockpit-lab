// Draws the stems of the handles of the selected part: a thin bar from the end a handle changes
// out to the handle itself, which the scene shows on top of the view. A move handle sits on its
// part, with no stem. Draws the dashed guide of what a dragged handle snapped to. Positions are in mm in cockpit coordinates; the scene works in cm.
import type { Handle } from './cad/handles.ts';
import type { SnapGuide } from './cad/snapping.ts';
import type { Vec3Mm } from './cad/assembly.ts';
import type { ParentRef, RenderList } from './render-list.ts';
import { MM_PER_CM } from './units.ts';

/** How far a handle stands off the end it changes, so it never hides behind the part. */
const HANDLE_STANDOFF_MM = 40;
const STEM_THICKNESS_CM = 0.3;

/** Where the ball of a handle is: off the end it changes, or at the center of a moved part. */
export function handleBallMm({ kind, pointMm, outwardMm }: Handle): Vec3Mm {
  if (kind === 'move') return { ...pointMm };
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
    const from = handle.pointMm;
    const to = handleBallMm(handle);
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
}

/** The guide of a snap, dashed in the accent of the handles, drawn over the parts it lines up. */
const SNAP_GUIDE = {
  kind: 'dashed',
  color: 0x2f7fd0,
  dashSize: 1.5,
  gapSize: 1,
  onTop: true,
} as const;

export function drawSnapGuide(r: RenderList, parent: ParentRef, guide: SnapGuide): void {
  const cm = ({ x, y, z }: Vec3Mm): [number, number, number] => [
    x / MM_PER_CM,
    y / MM_PER_CM,
    z / MM_PER_CM,
  ];
  r.line([cm(guide.fromMm), cm(guide.toMm)], r.material(SNAP_GUIDE), parent);
}
